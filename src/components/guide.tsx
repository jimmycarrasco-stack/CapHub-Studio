"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cx, Spinner, Textarea } from "./ui";

/**
 * The AI Guide: a chat drawer available on every page. It explains the app and can set things up
 * (contacts, deals, products, automations, sites…) through server-side tools.
 */

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; actions: string[] }
  | { kind: "tool"; label: string; ok: boolean | null };

const OPEN_EVENT = "caphub:open-guide";
const SUGGESTIONS = [
  "What should I set up first?",
  "Build me a lead magnet funnel for my business",
  "Create a follow-up automation for new leads",
  "How do I take payments?",
];

/** Button that opens the guide (optionally with a question). */
export function OpenGuideButton({ prompt, children }: { prompt?: string; children?: React.ReactNode }) {
  return (
    <Button variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: prompt }))}>
      <Sparkle className="size-4 text-brand-600" />
      {children ?? "Ask the AI Guide"}
    </Button>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}

export function GuideLauncher({ locationId, locationName }: { locationId: string; locationName: string }) {
  const router = useRouter();
  const path = usePathname();
  const storeKey = `caphub_guide_${locationId}`;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore this sub-account's conversation for the tab.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storeKey);
      setItems(saved ? (JSON.parse(saved) as Item[]) : []);
    } catch {
      setItems([]);
    }
  }, [storeKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(items.slice(-60)));
    } catch {
      /* storage unavailable */
    }
  }, [items, storeKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, open]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      const history = [...items, { kind: "user", text: q } as Item];
      setItems([...history, { kind: "assistant", text: "", actions: [] }]);
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;

      // Conversation sent to the server: user/assistant text only (actions summarized inline).
      const messages = history
        .filter((i): i is Exclude<Item, { kind: "tool" }> => i.kind !== "tool")
        .map((i) =>
          i.kind === "user"
            ? { role: "user" as const, content: i.text }
            : { role: "assistant" as const, content: (i.text || "(no reply)") + (i.actions.length ? `\n\n[Actions I took: ${i.actions.join("; ")}]` : "") },
        )
        .slice(-30);

      const patchLast = (fn: (a: Extract<Item, { kind: "assistant" }>) => Extract<Item, { kind: "assistant" }>) =>
        setItems((prev) => {
          const idx = prev.map((p) => p.kind).lastIndexOf("assistant");
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = fn(prev[idx] as Extract<Item, { kind: "assistant" }>);
          return next;
        });
      const insertBeforeLast = (item: Item) =>
        setItems((prev) => {
          const idx = prev.map((p) => p.kind).lastIndexOf("assistant");
          return idx < 0 ? [...prev, item] : [...prev.slice(0, idx), item, ...prev.slice(idx)];
        });

      try {
        const res = await fetch("/api/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, page: path }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let navigated = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const e = JSON.parse(line);
            if (e.type === "text") patchLast((a) => ({ ...a, text: a.text + e.delta }));
            else if (e.type === "tool") insertBeforeLast({ kind: "tool", label: e.label, ok: null });
            else if (e.type === "tool_result")
              setItems((prev) => {
                const idx = prev.map((p) => (p.kind === "tool" && p.ok === null ? 1 : 0)).lastIndexOf(1);
                if (idx < 0) return prev;
                const next = [...prev];
                next[idx] = { kind: "tool", label: e.label, ok: e.ok };
                return next;
              });
            else if (e.type === "navigate") {
              navigated = true;
              router.push(e.href);
            } else if (e.type === "done") patchLast((a) => ({ ...a, text: e.text || a.text, actions: e.actions }));
            else if (e.type === "error") patchLast((a) => ({ ...a, text: `${a.text}${a.text ? "\n\n" : ""}⚠️ ${e.error}` }));
          }
        }
        // Show changes the guide made on the current page.
        if (!navigated) router.refresh();
      } catch (err) {
        if ((err as Error).name !== "AbortError") patchLast((a) => ({ ...a, text: `⚠️ ${(err as Error).message}` }));
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, items, path, router],
  );

  // Open from anywhere (e.g. the dashboard button), optionally with a question.
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const prompt = (e as CustomEvent<string | undefined>).detail;
      if (prompt) void send(prompt);
      else setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [send]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white shadow-lg hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Sparkle className="size-4 text-brand-100" />
          AI Guide
        </button>
      )}

      {open && (
        <aside
          aria-label="AI Guide"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col bg-white shadow-2xl ring-1 ring-zinc-200 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[min(680px,calc(100vh-2rem))] sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-brand-50">
                <Sparkle className="size-4 text-brand-600" />
              </span>
              <div>
                <div className="text-sm font-semibold">AI Guide</div>
                <div className="text-[11px] text-zinc-500">{locationName}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setItems([]);
                  }}
                >
                  New chat
                </Button>
              )}
              <Button size="sm" variant="ghost" aria-label="Close guide" onClick={() => setOpen(false)}>
                ✕
              </Button>
            </div>
          </header>

          <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {items.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">
                  Hi! I can explain anything in CapHub Studio and set things up for you — contacts, pipelines, products, automations, websites and funnels.
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-lg bg-zinc-50 px-3 py-2 text-left text-sm text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {items.map((it, i) =>
              it.kind === "user" ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
                  {it.text}
                </div>
              ) : it.kind === "tool" ? (
                <div key={i} className={cx("flex items-center gap-2 text-xs", it.ok === false ? "text-red-600" : "text-zinc-500")}>
                  {it.ok === null ? <Spinner className="size-3" /> : <span aria-hidden="true">{it.ok ? "✓" : "✕"}</span>}
                  <span className="truncate" title={it.label}>
                    {it.label}
                  </span>
                </div>
              ) : (
                <div key={i} className={cx("mr-6 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800", !it.text && busy && i === items.length - 1 && "caret")}>
                  {formatReply(it.text)}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-zinc-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                aria-label="Message the AI Guide"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask anything, or tell me what to set up…"
                className="max-h-32 resize-none"
              />
              {busy ? (
                <Button type="button" onClick={() => abortRef.current?.abort()}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={!input.trim()}>
                  Send
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">The guide can create and update records, but never deletes or sends emails.</p>
          </form>
        </aside>
      )}
    </>
  );
}

/** Minimal formatting: **bold** and `code`; everything else is plain text. */
function formatReply(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-zinc-100 px-1 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}
