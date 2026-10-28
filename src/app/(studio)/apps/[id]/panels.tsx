"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Badge, Button, cx, Input, Spinner, timeAgo, toast } from "@/components/ui";
import type { Snapshot } from "@/lib/apps/repo";

const CodeEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-zinc-500">
      <Spinner />
    </div>
  ),
});

type TreeEntry = { path: string; type: "file" | "dir"; size?: number };

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", json: "json", css: "css", md: "markdown", html: "html", sql: "sql", yml: "yaml", yaml: "yaml" }[
      ext ?? ""
    ] ?? "plaintext"
  );
}

// ───────────────────────── Code ─────────────────────────

export function CodePanel({ appId, locked, refreshKey }: { appId: string; locked: boolean; refreshKey: number }) {
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [open, setOpen] = useState<{ path: string; content: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const dirty = !!open && draft !== open.content;

  const loadTree = useCallback(() => api<TreeEntry[]>(`/api/apps/${appId}/files`).then(setTree).catch((e) => toast(e.message, "error")), [appId]);

  const openFile = useCallback(
    async (path: string) => {
      try {
        const r = await api<{ path: string; content: string }>(`/api/apps/${appId}/files?path=${encodeURIComponent(path)}`);
        setOpen(r);
        setDraft(r.content);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [appId],
  );

  // Reload the tree (and the open file, if it has no unsaved edits) when the AI finishes a turn.
  const openRef = useRef<{ path: string; dirty: boolean } | null>(null);
  useEffect(() => {
    openRef.current = open ? { path: open.path, dirty } : null;
  });
  useEffect(() => {
    void loadTree();
    const cur = openRef.current;
    if (cur && !cur.dirty) {
      api<{ path: string; content: string }>(`/api/apps/${appId}/files?path=${encodeURIComponent(cur.path)}`)
        .then((r) => {
          setOpen(r);
          setDraft(r.content);
        })
        .catch(() => setOpen(null)); // file was deleted
    }
  }, [refreshKey, loadTree, appId]);

  async function save() {
    if (!open) return;
    setSaving(true);
    try {
      await api(`/api/apps/${appId}/files`, { method: "PUT", json: { path: open.path, content: draft } });
      setOpen({ ...open, content: draft });
      toast("Saved — the preview reloads automatically", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function newFile() {
    const path = window.prompt("New file path (e.g. src/app/about/page.tsx)");
    if (!path) return;
    try {
      await api(`/api/apps/${appId}/files`, { method: "PUT", json: { path, content: "" } });
      await loadTree();
      await openFile(path);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove() {
    if (!open || !window.confirm(`Delete ${open.path}? You can restore it from Versions.`)) return;
    try {
      await api(`/api/apps/${appId}/files?path=${encodeURIComponent(open.path)}`, { method: "DELETE" });
      setOpen(null);
      await loadTree();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const visible = useMemo(
    () => (tree ?? []).filter((e) => ![...collapsed].some((c) => e.path.startsWith(c + "/"))),
    [tree, collapsed],
  );

  return (
    <div className="flex h-full min-h-0">
      <nav className="scroll-thin w-56 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white py-2 text-[13px]" aria-label="Project files">
        <div className="mb-1 flex items-center justify-between px-3">
          <span className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Files</span>
          <button onClick={newFile} disabled={locked} className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-40" aria-label="New file" title="New file">
            +
          </button>
        </div>
        {tree === null ? (
          <div className="p-3">
            <Spinner />
          </div>
        ) : (
          visible.map((e) => {
            const depth = e.path.split("/").length - 1;
            const name = e.path.split("/").pop();
            const isCollapsed = collapsed.has(e.path);
            return (
              <button
                key={e.path}
                onClick={() =>
                  e.type === "dir"
                    ? setCollapsed((s) => {
                        const n = new Set(s);
                        if (n.has(e.path)) n.delete(e.path);
                        else n.add(e.path);
                        return n;
                      })
                    : openFile(e.path)
                }
                className={cx(
                  "flex w-full items-center gap-1 truncate py-0.5 pr-2 text-left hover:bg-zinc-100",
                  open?.path === e.path ? "bg-brand-50 text-brand-700" : "text-zinc-700",
                )}
                style={{ paddingLeft: 12 + depth * 12 }}
                title={e.path}
              >
                <span className="w-3 shrink-0 text-[10px] text-zinc-400">{e.type === "dir" ? (isCollapsed ? "▸" : "▾") : ""}</span>
                <span className={cx("truncate", e.type === "dir" && "font-medium")}>{name}</span>
              </button>
            );
          })
        )}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {open ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
              <span className="truncate font-mono text-xs text-zinc-300">
                {open.path} {dirty && <span className="text-amber-400">• unsaved</span>}
              </span>
              <span className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={remove} disabled={locked}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-white" disabled={!dirty} onClick={() => setDraft(open.content)}>
                  Discard
                </Button>
                <Button size="sm" variant="primary" disabled={!dirty || locked} loading={saving} onClick={save}>
                  Save
                </Button>
              </span>
            </div>
            {locked && <div className="bg-amber-50 px-3 py-1 text-[11px] text-amber-900">The AI is working — the editor is read-only until it finishes.</div>}
            <div className="min-h-0 flex-1">
              <CodeEditor
                path={open.path}
                language={languageFor(open.path)}
                theme="vs-dark"
                value={draft}
                onChange={(v) => setDraft(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false, readOnly: locked }}
              />
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-zinc-500">Pick a file to view or edit it.</div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Logs ─────────────────────────

export function LogsPanel({ appId }: { appId: string }) {
  const [logs, setLogs] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ logs: string }>(`/api/apps/${appId}/logs?lines=400`)
        .then((r) => alive && setLogs(r.logs))
        .catch(() => {});
    void load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [appId]);

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs, follow]);

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
        <span>Dev server output (refreshes every 3s)</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
      </div>
      <pre ref={ref} className="scroll-thin min-h-0 flex-1 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-zinc-200">
        {logs ?? "Loading…"}
      </pre>
    </div>
  );
}

// ───────────────────────── Versions ─────────────────────────

export function VersionsPanel({ appId, locked, refreshKey, onRestored }: { appId: string; locked: boolean; refreshKey: number; onRestored: () => void }) {
  const [rows, setRows] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    api<Snapshot[]>(`/api/apps/${appId}/snapshots`).then(setRows).catch((e) => toast(e.message, "error"));
  }, [appId, refreshKey]);

  async function restore(s: Snapshot) {
    if (!window.confirm(`Restore the project files to “${s.note}”? Your current files are kept as a version too, so this can be undone.`)) return;
    setBusy(s.id);
    try {
      await api(`/api/apps/${appId}/snapshots/${s.id}`, { method: "POST" });
      toast("Version restored", "success");
      onRestored();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4">
      <p className="mx-auto mb-3 max-w-2xl text-xs text-zinc-500">
        A version is saved after every AI change and manual edit. Restoring replaces the code; database data is not rolled back.
      </p>
      {rows === null ? (
        <Spinner />
      ) : (
        <ul className="mx-auto max-w-2xl divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
          {rows.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-900">
                  {s.note} {i === 0 && <Badge tone="brand">Current</Badge>}
                </div>
                <div className="text-xs text-zinc-500">
                  #{s.id} · {s.files} files · {timeAgo(s.created_at)}
                </div>
              </div>
              {i > 0 && (
                <Button size="sm" disabled={locked} loading={busy === s.id} onClick={() => restore(s)}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── GitHub ─────────────────────────

export function GithubDialog({ appId, defaultRepo, onClose, onPushed }: { appId: string; defaultRepo: string; onClose: () => void; onPushed: (repo: string) => void }) {
  const [repo, setRepo] = useState(defaultRepo);
  const [isPrivate, setIsPrivate] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; files: number; branch: string } | null>(null);

  async function push() {
    setBusy(true);
    try {
      const r = await api<{ repo: string; url: string; files: number; branch: string }>(`/api/apps/${appId}/github`, {
        method: "POST",
        json: { repo: repo.trim() || undefined, private: isPrivate, message: message.trim() || undefined },
      });
      setResult(r);
      onPushed(r.repo);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-zinc-950/40 p-4" role="dialog" aria-modal="true" aria-label="Push to GitHub" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">Push to GitHub</h2>
        {result ? (
          <>
            <p className="text-sm text-zinc-700">
              Pushed {result.files} files to <strong>{result.branch}</strong>.
            </p>
            <a href={result.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-700 hover:underline">
              {result.url} ↗
            </a>
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="gh-repo" className="block text-[13px] font-medium text-zinc-700">
                Repository
              </label>
              <Input id="gh-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo-name" className="font-mono" />
              <p className="text-xs text-zinc-500">Created if it doesn&apos;t exist. Each push makes the default branch match this project.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private (when creating a new repo)
            </label>
            <div className="space-y-1.5">
              <label htmlFor="gh-msg" className="block text-[13px] font-medium text-zinc-700">
                Commit message
              </label>
              <Input id="gh-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Update from CapHub Studio" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} onClick={push}>
                Push
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
