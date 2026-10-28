import "server-only";
import type { AgentMessage, LlmProvider, ToolResult } from "../llm/types";
import { AGENT_TOOLS, runTool, summarizeCall } from "./agent-tools";
import { formatTree, listTree, readFile } from "./files";
import type { AgentEventLog, AppMessage } from "./repo";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "step_text"; text: string }
  | { type: "tool"; id: string; name: string; summary: string }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "done"; summary: string; changed: boolean; steps: number; usage: { input: number; output: number } }
  | { type: "error"; message: string };

export const AGENT_MAX_STEPS = 60;
const STEP_MAX_TOKENS = 32_000;

export function buildAgentSystemPrompt(opts: { conventions: string; tree: string; history: string }) {
  return `You are CapHub Studio's app engineer: an expert full-stack developer who builds and edits a real, running web application by calling tools.

# Environment
- The project is a Next.js 16 (App Router) + TypeScript + Tailwind v4 + Drizzle ORM + Postgres app with built-in email/password auth, user/admin roles and an admin panel.
- It runs in a Linux container. The dev server is ALREADY running with hot reload; your file edits apply immediately. Never start it yourself.
- DATABASE_URL and AUTH_SECRET are already set. Schema changes in src/lib/db/schema.ts need \`npm run db:push\` (run it with run_command after changing the schema).
- The user sees a live preview of the app next to this chat.

# How to work
1. Explore just enough: list_files / read_file / search the files you need. Read a file before editing it.
2. Make focused changes with edit_file (small changes) or write_file (new files / rewrites). Keep files reasonably sized; split big UIs into components.
3. Install packages with \`npm install <pkg>\` via run_command when needed.
4. Verify before you finish: run \`npm run typecheck\` and fix all type errors, then use check_page on the pages/routes you touched (and get_logs if something fails). Fix problems and re-check.
5. Finish by replying WITHOUT calling tools: a short, plain-language summary for a non-technical user of what you built/changed and how to try it (pages to visit, accounts to create). Mention anything you couldn't do.

# Quality bar
- Production-quality, polished, responsive UI with real copy (no lorem ipsum). Accessible forms with labels.
- Validate input with zod on the server. Check authentication and authorization on every private page, server action and API route; never trust client-supplied user IDs.
- Keep the existing auth, roles, admin panel and /api/health route working unless the user asks otherwise.
- Never hardcode secrets. Never delete data or drop tables unless the user explicitly asks.
- Be efficient with steps: batch related reads, don't re-read files you just wrote, and don't narrate every step.

# Project conventions (AGENTS.md)
${opts.conventions}

# Current files
${opts.tree}
${opts.history ? `\n# Earlier in this project\n${opts.history}` : ""}`;
}

/** Compact recap of previous turns so the agent has continuity without replaying old tool calls. */
export function historyRecap(messages: AppMessage[], maxTurns = 8) {
  const recent = messages.slice(-maxTurns * 2);
  return recent.map((m) => (m.role === "user" ? `User asked: ${m.content}` : `You did: ${m.content}`)).join("\n").slice(-6000);
}

export interface RunAgentOptions {
  appId: string;
  provider: LlmProvider;
  prompt: string;
  history: AppMessage[];
  signal: AbortSignal;
  emit: (e: AgentEvent) => void;
  maxSteps?: number;
}

/** Runs one user request to completion. Returns the summary and a compact event log for storage. */
export async function runAgent(opts: RunAgentOptions): Promise<{ summary: string; log: AgentEventLog[]; changed: boolean }> {
  const { appId, provider, signal, emit } = opts;
  const maxSteps = opts.maxSteps ?? AGENT_MAX_STEPS;
  const conventions = await readFile(appId, "AGENTS.md").catch(() => "(none)");
  const tree = formatTree(await listTree(appId, "", 400));
  const system = buildAgentSystemPrompt({ conventions, tree, history: historyRecap(opts.history) });

  const messages: AgentMessage[] = [{ role: "user", content: opts.prompt }];
  const log: AgentEventLog[] = [];
  const usage = { input: 0, output: 0 };
  let changed = false;
  let lastText = "";

  for (let step = 1; step <= maxSteps; step++) {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const r = await provider.step({
      system,
      messages,
      tools: AGENT_TOOLS,
      maxTokens: STEP_MAX_TOKENS,
      signal,
      onText: (delta) => emit({ type: "text", delta }),
    });
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    messages.push({ role: "assistant", text: r.text, toolCalls: r.toolCalls, raw: r.raw });
    if (r.text.trim()) {
      lastText = r.text.trim();
      emit({ type: "step_text", text: lastText });
      log.push({ t: "text", text: lastText.slice(0, 2000) });
    }

    if (!r.toolCalls.length) {
      if (r.stop === "max_tokens") {
        messages.push({ role: "user", content: "Your last response was cut off. Continue." });
        continue;
      }
      const summary = lastText || (changed ? "Done." : "No changes were needed.");
      emit({ type: "done", summary, changed, steps: step, usage });
      return { summary, log, changed };
    }

    const results: ToolResult[] = [];
    for (const call of r.toolCalls) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const summary = summarizeCall(call.name, call.input);
      emit({ type: "tool", id: call.id, name: call.name, summary });
      const out = await runTool(appId, call.name, call.input, signal);
      if (out.changed) changed = true;
      const preview = out.output.split("\n").slice(0, 3).join(" ").slice(0, 200);
      emit({ type: "tool_result", id: call.id, ok: !out.isError, preview });
      log.push({ t: "tool", name: call.name, summary, ok: !out.isError, preview: out.isError ? preview : undefined });
      results.push({ id: call.id, output: out.output, isError: out.isError });
    }
    messages.push({ role: "tool", results });
  }

  const summary = `${lastText ? `${lastText}\n\n` : ""}(Stopped after ${maxSteps} steps — send "continue" to keep going.)`;
  emit({ type: "done", summary, changed, steps: maxSteps, usage });
  return { summary, log, changed };
}
