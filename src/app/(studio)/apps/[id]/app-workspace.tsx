"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, Badge, Button, cx, Spinner, Textarea, toast } from "@/components/ui";
import type { AppMessage, AppRow } from "@/lib/apps/repo";
import { LiveActivity, PastActivity, type LiveItem } from "./activity";
import { CodePanel, GithubDialog, LogsPanel, VersionsPanel } from "./panels";

type Tab = "preview" | "code" | "logs" | "versions";
type Status = { state: "running" | "stopped" | "missing"; ready: boolean; working: boolean; proxyError?: string | null };

const SUGGESTIONS = [
  "Make the design more polished and modern",
  "Add a settings page where users can change their name and password",
  "Add search and filters to the main list",
  "Add an admin dashboard with key stats",
  "Seed the database with realistic sample data",
];

const useHost = () =>
  useSyncExternalStore(
    () => () => {},
    () => `${window.location.protocol}//${window.location.hostname}`,
    () => "",
  );

/** Applies one streamed agent event to the live activity list. */
function applyEvent(items: LiveItem[], e: Record<string, unknown>): LiveItem[] {
  const next = [...items];
  const last = next[next.length - 1];
  switch (e.type) {
    case "status":
      next.push({ kind: "status", text: String(e.message) });
      break;
    case "text":
      if (last?.kind === "text" && last.streaming) next[next.length - 1] = { ...last, text: last.text + String(e.delta) };
      else next.push({ kind: "text", text: String(e.delta), streaming: true });
      break;
    case "step_text":
      if (last?.kind === "text" && last.streaming) next[next.length - 1] = { kind: "text", text: String(e.text) };
      else next.push({ kind: "text", text: String(e.text) });
      break;
    case "tool":
      if (last?.kind === "text" && last.streaming) next[next.length - 1] = { ...last, streaming: false };
      next.push({ kind: "tool", id: String(e.id), name: String(e.name), summary: String(e.summary ?? ""), state: "running" });
      break;
    case "tool_result": {
      const i = next.findLastIndex((x) => x.kind === "tool" && x.id === e.id);
      if (i >= 0) next[i] = { ...(next[i] as Extract<LiveItem, { kind: "tool" }>), state: e.ok ? "ok" : "error", preview: e.ok ? undefined : String(e.preview ?? "") };
      break;
    }
  }
  return next;
}

export function AppWorkspace({ initialApp, initialMessages, initiallyWorking }: { initialApp: AppRow; initialMessages: AppMessage[]; initiallyWorking: boolean }) {
  const router = useRouter();
  const host = useHost();
  const [app, setApp] = useState(initialApp);
  const [messages, setMessages] = useState(initialMessages);
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [working, setWorking] = useState(initiallyWorking);
  const [status, setStatus] = useState<Status | null>(null);
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState<Tab>("preview");
  const [previewPath, setPreviewPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [previewKey, setPreviewKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [showGithub, setShowGithub] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const following = useRef(false);

  const previewOrigin = host ? `${host}:${app.port}` : "";

  // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, live]);

  const reloadMessages = useCallback(async () => {
    const r = await api<AppRow & { messages: AppMessage[]; working: boolean }>(`/api/apps/${app.id}`);
    setMessages(r.messages);
    setApp(r);
    return r;
  }, [app.id]);

  /** Follows the current AI turn's event stream until it ends (reconnects if the connection drops). */
  const follow = useCallback(async () => {
    if (following.current) return;
    following.current = true;
    setWorking(true);
    setLive((l) => l ?? []);
    let from = 0;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        let ended = false;
        try {
          const res = await fetch(`/api/apps/${app.id}/events?from=${from}`);
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              const e = JSON.parse(line);
              if (typeof e.i === "number") from = e.i + 1;
              if (e.type === "end" || e.type === "idle") ended = true;
              else if (e.type === "error") toast(e.message, "error");
              else setLive((l) => applyEvent(l ?? [], e));
              if (e.type === "tool_result" && e.ok) setPreviewKey((k) => k); // no-op; preview hot-reloads itself
            }
          }
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (ended) break;
      }
    } finally {
      following.current = false;
      setWorking(false);
      setLive(null);
      setRefreshKey((k) => k + 1);
      setPreviewKey((k) => k + 1);
      await reloadMessages().catch(() => {});
    }
  }, [app.id, reloadMessages]);

  useEffect(() => {
    if (initiallyWorking) void follow();
  }, [initiallyWorking, follow]);

  // Poll container state.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Status>(`/api/apps/${app.id}/status`)
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          if (s.working && !following.current) void follow();
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [app.id, follow]);

  async function send(text: string) {
    const p = text.trim();
    if (!p || working) return;
    setPrompt("");
    setMessages((m) => [...m, { id: Date.now(), role: "user", content: p, events: null, created_at: new Date().toISOString() }]);
    try {
      await api(`/api/apps/${app.id}/chat`, { method: "POST", json: { prompt: p } });
      void follow();
    } catch (e) {
      toast((e as Error).message, "error");
      void reloadMessages();
    }
  }

  async function action(name: "start" | "stop" | "restart" | "cancel") {
    setBusy(name);
    try {
      await api(`/api/apps/${app.id}/${name}`, { method: "POST" });
      if (name !== "cancel") setStatus((s) => (s ? { ...s, state: name === "stop" ? "stopped" : "running", ready: false } : s));
      if (name === "start" || name === "restart") setPreviewKey((k) => k + 1);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function rename(name: string) {
    if (!name || name === app.name) return;
    try {
      setApp(await api<AppRow>(`/api/apps/${app.id}`, { method: "PATCH", json: { name } }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove() {
    const typed = window.prompt(`This permanently deletes "${app.name}": its code, versions, container and database. Type the app name to confirm.`);
    if (typed !== app.name) {
      if (typed !== null) toast("Name didn't match — nothing was deleted", "info");
      return;
    }
    try {
      await api(`/api/apps/${app.id}`, { method: "DELETE" });
      router.push("/apps");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const state = status?.state;
  const statusBadge = working ? (
    <Badge tone="brand">
      <Spinner className="size-3" /> AI working
    </Badge>
  ) : !status ? (
    <Badge>Checking…</Badge>
  ) : state === "running" ? (
    status.ready ? <Badge tone="green">Running</Badge> : <Badge tone="amber">Starting…</Badge>
  ) : (
    <Badge>Stopped</Badge>
  );

  return (
    <div className="flex h-full min-h-[640px] flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <Link href="/apps" className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" aria-label="Back to apps">
          ←
        </Link>
        <input
          aria-label="App name"
          defaultValue={app.name}
          onBlur={(e) => rename(e.target.value.trim())}
          className="min-w-0 max-w-56 rounded-md px-2 py-1 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
        {statusBadge}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {state === "running" ? (
            <>
              <Button size="sm" variant="ghost" loading={busy === "restart"} disabled={working} onClick={() => action("restart")}>
                Restart
              </Button>
              <Button size="sm" variant="ghost" loading={busy === "stop"} disabled={working} onClick={() => action("stop")}>
                Stop
              </Button>
            </>
          ) : (
            <Button size="sm" loading={busy === "start"} disabled={!status} onClick={() => action("start")}>
              Start app
            </Button>
          )}
          <a href={`/api/apps/${app.id}/download`} className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100">
            Download
          </a>
          <Button size="sm" variant="ghost" onClick={() => setShowGithub(true)}>
            {app.github_repo ? "Push to GitHub" : "GitHub"}
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={working} onClick={remove}>
            Delete
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Chat */}
        <section className="flex max-h-[50vh] min-h-0 w-full flex-col border-b border-zinc-200 bg-white lg:max-h-none lg:w-[400px] lg:border-r lg:border-b-0">
          <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !working && (
              <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">
                Describe what this app should do. The AI writes the code, runs it, checks for errors and fixes them. Keep chatting to change anything.
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[90%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white">{m.content}</div>
                </div>
              ) : (
                <div key={m.id}>
                  <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-sm whitespace-pre-wrap text-zinc-800">{m.content}</div>
                  {m.events && <PastActivity events={m.events} />}
                </div>
              ),
            )}
            {working && (
              <div className="rounded-xl ring-1 ring-brand-100">
                <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
                  <Spinner className="size-3" /> Working on it… you can leave this page; progress is saved.
                </div>
                <div className="p-2">{live && live.length ? <LiveActivity items={live} /> : <p className="px-2 py-1 text-xs text-zinc-500">Starting…</p>}</div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          <div className="border-t border-zinc-100 p-3">
            {!working && messages.length > 0 && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(prompt);
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                aria-label="Message the AI"
                rows={2}
                value={prompt}
                disabled={working}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(prompt);
                  }
                }}
                placeholder={working ? "The AI is working…" : "Describe a feature or a fix…"}
                className="resize-none"
              />
              {working ? (
                <Button type="button" loading={busy === "cancel"} onClick={() => action("cancel")}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={!prompt.trim()}>
                  Send
                </Button>
              )}
            </form>
          </div>
        </section>

        {/* Workspace */}
        <section className="flex min-h-[480px] min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white px-3 py-1.5">
            {(["preview", "code", "logs", "versions"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cx("rounded-md px-3 py-1.5 text-[13px] font-medium capitalize", tab === t ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-800")}
              >
                {t}
              </button>
            ))}
            {tab === "preview" && (
              <form
                className="ml-auto flex min-w-0 items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = pathInput.startsWith("/") ? pathInput : `/${pathInput}`;
                  setPreviewPath(p);
                  setPreviewKey((k) => k + 1);
                }}
              >
                <span className="hidden font-mono text-xs text-zinc-400 sm:inline">:{app.port}</span>
                <input
                  aria-label="Preview path"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  className="h-7 w-40 rounded-md px-2 font-mono text-xs ring-1 ring-zinc-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
                <button type="submit" className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100" aria-label="Reload preview">
                  ↻
                </button>
                <a href={`${previewOrigin}${previewPath}`} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                  Open ↗
                </a>
              </form>
            )}
          </div>

          <div className="relative min-h-0 flex-1 bg-zinc-100">
            {tab === "preview" &&
              (state === "running" && previewOrigin ? (
                <div className="flex h-full flex-col">
                  {status?.proxyError && <div className="bg-red-50 px-3 py-1.5 text-xs text-red-800">{status.proxyError}</div>}
                  {!status?.ready && (
                    <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                      <Spinner className="size-3" /> The app is starting (installing packages and compiling on first run can take a few minutes). See Logs for progress.
                    </div>
                  )}
                  <iframe
                    key={previewKey}
                    title="App preview"
                    src={`${previewOrigin}${previewPath}`}
                    className="min-h-0 w-full flex-1 bg-white"
                    onLoad={(e) => {
                      // Keep the path box in sync when the user navigates inside the preview (same-site only).
                      try {
                        const loc = (e.target as HTMLIFrameElement).contentWindow?.location;
                        if (loc) setPathInput(loc.pathname + loc.search);
                      } catch {
                        /* cross-origin: ignore */
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="grid h-full place-items-center p-6 text-center">
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-600">{status ? "The app isn't running." : "Checking the app…"}</p>
                    {status && (
                      <Button variant="primary" loading={busy === "start"} onClick={() => action("start")}>
                        Start app
                      </Button>
                    )}
                    <p className="text-xs text-zinc-500">Needs Docker running on this computer (Settings → AI & runtime shows its status).</p>
                  </div>
                </div>
              ))}
            {tab === "code" && <CodePanel appId={app.id} locked={working} refreshKey={refreshKey} />}
            {tab === "logs" && <LogsPanel appId={app.id} />}
            {tab === "versions" && (
              <VersionsPanel
                appId={app.id}
                locked={working}
                refreshKey={refreshKey}
                onRestored={() => {
                  setRefreshKey((k) => k + 1);
                  setPreviewKey((k) => k + 1);
                }}
              />
            )}
          </div>
        </section>
      </div>

      {showGithub && (
        <GithubDialog
          appId={app.id}
          defaultRepo={app.github_repo ?? ""}
          onClose={() => setShowGithub(false)}
          onPushed={(repo) => setApp((a) => ({ ...a, github_repo: repo }))}
        />
      )}
    </div>
  );
}
