"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, Badge, Button, cx, Input, Spinner, Textarea, timeAgo, toast, Toggle } from "@/components/ui";
import type { Site, SiteMessage, SiteVersion, Submission } from "@/lib/repo";
import { injectRuntime } from "@/lib/site-builder";
import { PENDING_PROMPT_KEY } from "../new-site-form";

const CodeEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      <Spinner />
    </div>
  ),
});

type Tab = "preview" | "code" | "versions" | "submissions";
type Device = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<Device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" };

const EDIT_SUGGESTIONS = [
  "Make the design more premium and modern",
  "Add a testimonials section with 3 reviews",
  "Add an FAQ section",
  "Change the color palette to navy and gold",
  "Make the hero headline more compelling",
  "Add a sticky header with a CTA button",
];

const useOrigin = () =>
  useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

export function SiteEditor({
  initialSite,
  initialMessages,
  agents,
}: {
  initialSite: Site;
  initialMessages: SiteMessage[];
  agents: { id: string; name: string; widget_enabled: boolean }[];
}) {
  const router = useRouter();
  const origin = useOrigin();
  const [site, setSite] = useState(initialSite);
  const [html, setHtml] = useState(initialSite.html);
  const [messages, setMessages] = useState(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [stream, setStream] = useState("");
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [codeDraft, setCodeDraft] = useState(initialSite.html);
  const [viewing, setViewing] = useState<{ id: number; html: string } | null>(null);
  const [versions, setVersions] = useState<SiteVersion[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamBoxRef = useRef<HTMLPreElement>(null);
  const autoRan = useRef(false);

  const dirty = codeDraft !== html;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, generating]);

  useEffect(() => {
    if (streamBoxRef.current) streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
  }, [stream]);

  const patch = useCallback(
    async (body: Partial<Site> & { html?: string }) => {
      const updated = await api<Site>(`/api/sites/${site.id}`, { method: "PATCH", json: body });
      setSite(updated);
      return updated;
    },
    [site.id],
  );

  const generate = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (!instruction || generating) return;
      setPrompt("");
      setGenerating(true);
      setStream("");
      setViewing(null);
      setTab("preview");
      setMessages((m) => [...m, { id: Date.now(), role: "user", content: instruction, created_at: new Date().toISOString() }]);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const pushAssistant = (content: string) =>
        setMessages((m) => [...m, { id: Date.now() + 1, role: "assistant", content, created_at: new Date().toISOString() }]);

      try {
        const res = await fetch(`/api/sites/${site.id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: instruction }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "delta") setStream((s) => s + ev.text);
            else if (ev.type === "done") {
              setHtml(ev.html);
              setCodeDraft(ev.html);
              setVersions(null);
              pushAssistant(ev.summary);
            } else if (ev.type === "error") {
              pushAssistant(`⚠️ ${ev.message}`);
              toast(ev.message, "error");
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") pushAssistant("Stopped.");
        else {
          pushAssistant(`⚠️ ${(err as Error).message}`);
          toast((err as Error).message, "error");
        }
      } finally {
        setGenerating(false);
        setStream("");
        abortRef.current = null;
      }
    },
    [generating, site.id],
  );

  // Run the prompt typed on the "new site" screen.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_PROMPT_KEY(site.id));
      sessionStorage.removeItem(PENDING_PROMPT_KEY(site.id));
    } catch {
      /* ignore */
    }
    if (pending && !initialSite.html) void generate(pending);
  }, [generate, initialSite.html, site.id]);

  // Lazy-load tab data.
  useEffect(() => {
    if (tab === "versions" && versions === null) api<SiteVersion[]>(`/api/sites/${site.id}/versions`).then(setVersions).catch((e) => toast(e.message, "error"));
    if (tab === "submissions" && submissions === null)
      api<Submission[]>(`/api/sites/${site.id}/submissions`).then(setSubmissions).catch((e) => toast(e.message, "error"));
  }, [tab, versions, submissions, site.id]);

  const shownHtml = viewing?.html ?? html;
  const srcDoc = useMemo(
    () => (origin && shownHtml ? injectRuntime(shownHtml, { siteId: site.id, baseUrl: origin, agentId: site.agent_id, mode: "preview" }) : ""),
    [origin, shownHtml, site.id, site.agent_id],
  );

  async function saveCode() {
    try {
      await patch({ html: codeDraft });
      setHtml(codeDraft);
      setVersions(null);
      toast("Code saved as a new version", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function togglePublish(on: boolean) {
    try {
      await patch({ published: on });
      toast(on ? "Published — your page is live" : "Unpublished", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function viewVersion(v: SiteVersion) {
    try {
      const r = await api<{ html: string }>(`/api/sites/${site.id}/versions/${v.id}`);
      setViewing({ id: v.id, html: r.html });
      setTab("preview");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function restoreVersion(id: number) {
    try {
      const r = await api<{ html: string }>(`/api/sites/${site.id}/versions/${id}`, { method: "POST" });
      setHtml(r.html);
      setCodeDraft(r.html);
      setViewing(null);
      setVersions(null);
      toast(`Restored version #${id}`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function deleteSite() {
    if (!confirm(`Delete "${site.name}"? This permanently removes the page, its versions and all form submissions.`)) return;
    try {
      await api(`/api/sites/${site.id}`, { method: "DELETE" });
      router.push("/sites");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const liveUrl = origin ? `${origin}/p/${site.slug}` : `/p/${site.slug}`;
  const attachedAgent = agents.find((a) => a.id === site.agent_id);

  return (
    <div className="flex h-full min-h-[600px] flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <Link href="/sites" className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" aria-label="Back to sites">
          ←
        </Link>
        <input
          aria-label="Site name"
          defaultValue={site.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== site.name) patch({ name: v }).catch((err) => toast(err.message, "error"));
          }}
          className="min-w-0 max-w-64 rounded-md px-2 py-1 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
        {site.published ? <Badge tone="green">Published</Badge> : <Badge>Draft</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="hidden lg:inline">Chat agent</span>
            <select
              aria-label="Chat agent on this page"
              value={site.agent_id ?? ""}
              onChange={(e) => patch({ agent_id: e.target.value || null }).catch((err) => toast(err.message, "error"))}
              className="h-8 max-w-44 rounded-lg bg-white px-2 text-xs ring-1 ring-zinc-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">None</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.widget_enabled ? "" : " (widget off)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
            Publish
            <Toggle checked={site.published} onChange={togglePublish} label="Publish page" />
          </label>
          {site.published && (
            <a href={`/p/${site.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
              Open live ↗
            </a>
          )}
          <a
            href={html ? `/api/sites/${site.id}/export` : undefined}
            aria-disabled={!html}
            className={cx("inline-flex h-8 items-center rounded-lg bg-white px-3 text-[13px] font-medium ring-1 ring-zinc-200", html ? "text-zinc-800 hover:bg-zinc-50" : "pointer-events-none opacity-50")}
          >
            Export HTML
          </a>
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
              Settings
            </Button>
            {showSettings && (
              <div className="absolute right-0 z-20 mt-1 w-80 space-y-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-zinc-200">
                <SlugEditor slug={site.slug} onSave={(slug) => patch({ slug })} />
                {site.agent_id && attachedAgent && !attachedAgent.widget_enabled && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                    The attached agent&apos;s widget is turned off, so it won&apos;t appear.{" "}
                    <Link className="underline" href={`/agents/${site.agent_id}`}>
                      Turn it on
                    </Link>
                  </p>
                )}
                <div className="border-t border-zinc-100 pt-3">
                  <Button size="sm" variant="danger" onClick={deleteSite}>
                    Delete site
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Chat panel */}
        <section className="flex max-h-[45vh] min-h-0 w-full flex-col border-b border-zinc-200 bg-white lg:max-h-none lg:w-[380px] lg:border-r lg:border-b-0">
          <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !generating && (
              <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">
                Describe the page you want. Then keep chatting to change copy, layout, colors or sections.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[90%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user" ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-zinc-100 text-zinc-800",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {generating && (
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-sm text-zinc-600">
                <Spinner className="size-3.5" />
                {stream ? `Writing… ${Math.round(stream.length / 1000)}k characters` : "Thinking…"}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-zinc-100 p-3">
            {html && !generating && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {EDIT_SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => generate(s)} className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generate(prompt);
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                aria-label={html ? "Describe a change" : "Describe your page"}
                rows={2}
                value={prompt}
                disabled={generating}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void generate(prompt);
                  }
                }}
                placeholder={html ? "Describe a change…" : "Describe your page…"}
                className="resize-none"
              />
              {generating ? (
                <Button type="button" onClick={() => abortRef.current?.abort()}>
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
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white px-3 py-1.5">
            {(["preview", "code", "versions", "submissions"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cx("rounded-md px-3 py-1.5 text-[13px] font-medium capitalize", tab === t ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-800")}
              >
                {t}
                {t === "code" && dirty && <span className="ml-1 text-amber-600">•</span>}
              </button>
            ))}
            {tab === "preview" && (
              <div className="ml-auto flex items-center gap-1">
                {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    aria-pressed={device === d}
                    className={cx("rounded-md px-2.5 py-1 text-xs capitalize", device === d ? "bg-brand-50 font-medium text-brand-700" : "text-zinc-500 hover:bg-zinc-100")}
                  >
                    {d}
                  </button>
                ))}
                <button onClick={() => setPreviewKey((k) => k + 1)} className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100" aria-label="Reload preview">
                  ↻
                </button>
              </div>
            )}
          </div>

          <div className="relative min-h-0 flex-1 bg-zinc-100">
            {tab === "preview" && (
              <div className="flex h-full flex-col">
                {viewing && (
                  <div className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                    <span>Viewing version #{viewing.id} — not the current page.</span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => restoreVersion(viewing.id)}>
                        Restore this version
                      </Button>
                      <Button size="sm" onClick={() => setViewing(null)}>
                        Back to current
                      </Button>
                    </span>
                  </div>
                )}
                <div className="flex min-h-0 flex-1 justify-center overflow-auto p-3">
                  {srcDoc ? (
                    <iframe
                      key={previewKey}
                      title="Page preview"
                      srcDoc={srcDoc}
                      sandbox="allow-scripts allow-forms allow-popups allow-modals"
                      className="h-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200 transition-[width]"
                      style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}
                    />
                  ) : (
                    !generating && (
                      <div className="grid h-full place-items-center text-sm text-zinc-500">Your page preview will appear here.</div>
                    )
                  )}
                </div>
                {generating && (
                  <div className="absolute inset-0 flex flex-col bg-zinc-950/85 p-4 backdrop-blur-sm">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
                      <Spinner className="size-3.5" /> Generating your page…
                    </div>
                    <pre ref={streamBoxRef} className="scroll-thin min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-emerald-300/90">
                      <span className="caret">{stream.slice(-6000)}</span>
                    </pre>
                  </div>
                )}
              </div>
            )}

            {tab === "code" && (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
                  <span className="text-xs text-zinc-400">index.html {dirty && "— unsaved changes"}</span>
                  <span className="flex gap-2">
                    <Button size="sm" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-white" disabled={!dirty} onClick={() => setCodeDraft(html)}>
                      Discard
                    </Button>
                    <Button size="sm" variant="primary" disabled={!dirty || generating} onClick={saveCode}>
                      Save
                    </Button>
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <CodeEditor
                    language="html"
                    theme="vs-dark"
                    value={codeDraft}
                    onChange={(v) => setCodeDraft(v ?? "")}
                    options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false, readOnly: generating }}
                  />
                </div>
              </div>
            )}

            {tab === "versions" && (
              <div className="scroll-thin h-full overflow-y-auto p-4">
                {versions === null ? (
                  <Spinner />
                ) : versions.length === 0 ? (
                  <p className="text-sm text-zinc-500">No versions yet.</p>
                ) : (
                  <ul className="mx-auto max-w-2xl divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
                    {versions.map((v, i) => (
                      <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-zinc-900">
                            #{v.id} · {v.note || "Update"} {i === 0 && <Badge tone="brand">Current</Badge>}
                          </div>
                          <div className="text-xs text-zinc-500">{timeAgo(v.created_at)}</div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" onClick={() => viewVersion(v)}>
                            Preview
                          </Button>
                          {i > 0 && (
                            <Button size="sm" variant="primary" onClick={() => restoreVersion(v.id)}>
                              Restore
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "submissions" && (
              <SubmissionsTable
                rows={submissions}
                csvHref={`/api/sites/${site.id}/submissions?format=csv`}
                published={site.published}
                liveUrl={liveUrl}
                onRefresh={() => {
                  setSubmissions(null);
                }}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SlugEditor({ slug, onSave }: { slug: string; onSave: (slug: string) => Promise<unknown> }) {
  const [value, setValue] = useState(slug);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor="slug" className="block text-[13px] font-medium text-zinc-700">
        Page URL
      </label>
      <div className="flex gap-2">
        <div className="flex flex-1 items-center rounded-lg ring-1 ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-500">
          <span className="pl-2.5 font-mono text-xs text-zinc-400">/p/</span>
          <Input id="slug" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono text-xs ring-0 focus:ring-0" />
        </div>
        <Button
          size="sm"
          loading={saving}
          disabled={value === slug || !value.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              const r = (await onSave(value)) as Site;
              setValue(r.slug);
              toast("URL updated", "success");
            } catch (err) {
              toast((err as Error).message, "error");
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function SubmissionsTable({
  rows,
  csvHref,
  published,
  liveUrl,
  onRefresh,
}: {
  rows: Submission[] | null;
  csvHref: string;
  published: boolean;
  liveUrl: string;
  onRefresh: () => void;
}) {
  const fields = useMemo(() => [...new Set((rows ?? []).flatMap((r) => Object.keys(r.data)))], [rows]);
  return (
    <div className="scroll-thin h-full overflow-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-zinc-600">
          {published ? (
            <>
              Forms on <span className="font-mono text-xs">{liveUrl}</span> are captured here.
            </>
          ) : (
            "Publish the page to start collecting form submissions."
          )}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onRefresh}>
            Refresh
          </Button>
          {!!rows?.length && (
            <a href={csvHref} className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-[13px] font-medium text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50">
              Download CSV
            </a>
          )}
        </div>
      </div>
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Form</th>
                {fields.map((f) => (
                  <th key={f} className="px-3 py-2 font-medium">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{timeAgo(r.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.form_name}</td>
                  {fields.map((f) => (
                    <td key={f} className="max-w-64 truncate px-3 py-2" title={r.data[f]}>
                      {r.data[f] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
