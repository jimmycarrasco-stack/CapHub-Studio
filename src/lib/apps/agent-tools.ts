import "server-only";
import type { ToolDef } from "../llm/types";
import { clip } from "./docker";
import { deletePath, editFile, formatTree, listTree, readFile, searchFiles, writeFile } from "./workspace";
import { appLogs, checkPage, execInApp, restartApp, waitForHttp } from "./runtime";
import { requireApp } from "./repo";

/** Tools the coding agent can call. Everything runs inside the app's workspace or container. */
export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "list_files",
    description: "List project files recursively (node_modules and .next are hidden). Use a sub-path to narrow it.",
    parameters: { type: "object", properties: { path: { type: "string", description: "Directory relative to the project root. Omit for the whole project." } } },
  },
  {
    name: "read_file",
    description: "Read a text file. Always read a file before editing it.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Create a file or completely replace its contents. Use for new files or full rewrites. For small changes prefer edit_file.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  },
  {
    name: "edit_file",
    description:
      "Replace an exact snippet in a file. old_string must match the file exactly (including whitespace) and be unique unless replace_all is true.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file or directory.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "search",
    description: "Search project files with a case-insensitive regular expression. Returns path:line: text.",
    parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] },
  },
  {
    name: "run_command",
    description:
      "Run a bash command in the app's container (cwd /app, Linux, Node 22). Use for `npm install <pkg>`, `npx tsc --noEmit`, `npm run db:push`, etc. " +
      "Do NOT start the dev server (it's already running) or run long-lived/interactive commands.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" }, timeout_seconds: { type: "number", description: "Default 120, max 600" } },
      required: ["command"],
    },
  },
  {
    name: "check_page",
    description:
      "Request a page or API route from the running app (e.g. '/' or '/api/health') and get the status, title and visible text, or the server error if it failed. Use to verify your work.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "get_logs",
    description: "Recent output from the app's dev server (compile errors, runtime errors, db:push output).",
    parameters: { type: "object", properties: { lines: { type: "number", description: "Default 100" } } },
  },
  {
    name: "restart_app",
    description: "Restart the app container: reinstalls changed dependencies, re-runs db:push and restarts the dev server. Needed after changing next.config or env-dependent setup.",
    parameters: { type: "object", properties: {} },
  },
];

const str = (v: unknown, name: string) => {
  if (typeof v !== "string") throw new Error(`"${name}" must be a string`);
  return v;
};

/** One-line description of a tool call for the activity feed. */
export function summarizeCall(name: string, input: Record<string, unknown> | null) {
  if (!input) return name;
  const p = typeof input.path === "string" ? input.path : "";
  switch (name) {
    case "read_file":
    case "write_file":
    case "edit_file":
    case "delete_file":
      return p;
    case "list_files":
      return p || "/";
    case "search":
      return String(input.pattern ?? "");
    case "run_command":
      return String(input.command ?? "").slice(0, 160);
    case "check_page":
      return p || "/";
    default:
      return "";
  }
}

export interface ToolOutcome {
  output: string;
  isError: boolean;
  /** True if the tool changed project files. */
  changed?: boolean;
}

export async function runTool(appId: string, name: string, input: Record<string, unknown> | null, signal?: AbortSignal): Promise<ToolOutcome> {
  if (!input) {
    return {
      output:
        "Your tool input was cut off or was not valid JSON (often because the content was too long for one response). " +
        "Write large files in parts: create the file with the first part, then add the rest with edit_file.",
      isError: true,
    };
  }
  try {
    switch (name) {
      case "list_files": {
        const tree = await listTree(appId, typeof input.path === "string" ? input.path : "");
        return { output: clip(formatTree(tree) || "(empty)", 15_000), isError: false };
      }
      case "read_file":
        return { output: clip(await readFile(appId, str(input.path, "path")), 60_000), isError: false };
      case "write_file": {
        const r = await writeFile(appId, str(input.path, "path"), str(input.content, "content"));
        return { output: r.created ? `Created ${input.path}` : `Wrote ${input.path}`, isError: false, changed: true };
      }
      case "edit_file": {
        const r = await editFile(appId, str(input.path, "path"), str(input.old_string, "old_string"), str(input.new_string, "new_string"), input.replace_all === true);
        return { output: `Edited ${input.path} (${r.replacements} replacement${r.replacements === 1 ? "" : "s"})`, isError: false, changed: true };
      }
      case "delete_file":
        await deletePath(appId, str(input.path, "path"));
        return { output: `Deleted ${input.path}`, isError: false, changed: true };
      case "search": {
        const hits = await searchFiles(appId, str(input.pattern, "pattern"), typeof input.path === "string" ? input.path : "");
        return { output: hits.length ? hits.join("\n") : "No matches", isError: false };
      }
      case "run_command": {
        const cmd = str(input.command, "command");
        if (/\b(npm|pnpm|yarn)\s+(run\s+)?dev\b|\bnext\s+dev\b/.test(cmd)) {
          return { output: "The dev server is already running. Use restart_app to restart it, or check_page to test it.", isError: true };
        }
        const secs = Math.min(Math.max(Number(input.timeout_seconds) || 120, 5), 600);
        const r = await execInApp(appId, cmd, { timeoutMs: secs * 1000, signal });
        const out = [r.stdout, r.stderr].filter((s) => s.trim()).join("\n");
        const head = r.timedOut ? `Timed out after ${secs}s.` : `Exit code ${r.code}.`;
        // npm install / file-generating commands can change the workspace.
        return { output: clip(`${head}\n${out || "(no output)"}`), isError: r.code !== 0, changed: true };
      }
      case "check_page": {
        const r = await checkPage(appId, str(input.path, "path"));
        return { output: r.summary, isError: r.status === 0 || r.status >= 500 };
      }
      case "get_logs":
        return { output: clip((await appLogs(appId, Number(input.lines) || 100)).trim() || "(no output yet)"), isError: false };
      case "restart_app": {
        await restartApp(appId);
        const ok = await waitForHttp(requireApp(appId), 240_000, signal);
        const logs = clip((await appLogs(appId, 40)).trim(), 4000);
        return { output: ok ? `Restarted. Dev server is responding.\nRecent logs:\n${logs}` : `Restarted, but the dev server isn't responding yet.\nRecent logs:\n${logs}`, isError: !ok };
      }
      default:
        return { output: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { output: (err as Error).message, isError: true };
  }
}
