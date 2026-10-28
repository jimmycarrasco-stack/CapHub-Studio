"use client";

import { useState } from "react";
import { cx, Spinner } from "@/components/ui";
import type { AgentEventLog } from "@/lib/apps/repo";

/** Live item shown while the AI works. */
export type LiveItem =
  | { kind: "status"; text: string }
  | { kind: "text"; text: string; streaming?: boolean }
  | { kind: "tool"; id: string; name: string; summary: string; state: "running" | "ok" | "error"; preview?: string };

const TOOL_LABEL: Record<string, string> = {
  list_files: "Listed files",
  read_file: "Read",
  write_file: "Wrote",
  edit_file: "Edited",
  delete_file: "Deleted",
  search: "Searched",
  run_command: "Ran",
  check_page: "Checked page",
  get_logs: "Read logs",
  restart_app: "Restarted app",
};

function ToolRow({ name, summary, state, preview }: { name: string; summary: string; state: "running" | "ok" | "error"; preview?: string }) {
  const [open, setOpen] = useState(false);
  const isCmd = name === "run_command";
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => preview && setOpen((o) => !o)}
        className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left", preview ? "hover:bg-zinc-100" : "cursor-default")}
        aria-expanded={preview ? open : undefined}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {state === "running" ? (
            <Spinner className="size-3" />
          ) : state === "ok" ? (
            <span className="text-emerald-600">✓</span>
          ) : (
            <span className="text-red-600">✗</span>
          )}
        </span>
        <span className="shrink-0 text-zinc-500">{TOOL_LABEL[name] ?? name}</span>
        <span className={cx("truncate text-zinc-800", isCmd || name.endsWith("_file") ? "font-mono text-[11px]" : "")}>{summary}</span>
      </button>
      {open && preview && <pre className="mx-2 mb-1 overflow-x-auto rounded bg-zinc-900 px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap text-zinc-100">{preview}</pre>}
    </div>
  );
}

export function LiveActivity({ items }: { items: LiveItem[] }) {
  return (
    <div className="space-y-1">
      {items.map((it, i) =>
        it.kind === "status" ? (
          <div key={i} className="flex items-center gap-2 px-2 text-xs text-zinc-500">
            <span className="size-1.5 rounded-full bg-zinc-300" />
            {it.text}
          </div>
        ) : it.kind === "text" ? (
          <div key={i} className={cx("rounded-xl bg-zinc-100 px-3 py-2 text-sm whitespace-pre-wrap text-zinc-800", it.streaming && "caret")}>
            {it.text}
          </div>
        ) : (
          <ToolRow key={it.id + i} {...it} />
        ),
      )}
    </div>
  );
}

/** Collapsible record of a finished turn. */
export function PastActivity({ events }: { events: AgentEventLog[] }) {
  const [open, setOpen] = useState(false);
  const tools = events.filter((e) => e.t === "tool");
  if (!tools.length) return null;
  const errors = tools.filter((e) => e.t === "tool" && !e.ok).length;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="px-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800" aria-expanded={open}>
        {open ? "Hide" : "Show"} {tools.length} step{tools.length === 1 ? "" : "s"}
        {errors ? ` (${errors} retried)` : ""}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 rounded-lg bg-zinc-50 p-1">
          {events.map((e, i) =>
            e.t === "tool" ? (
              <ToolRow key={i} name={e.name} summary={e.summary} state={e.ok ? "ok" : "error"} preview={e.preview} />
            ) : (
              <p key={i} className="px-2 py-1 text-xs whitespace-pre-wrap text-zinc-600">
                {e.text}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
}
