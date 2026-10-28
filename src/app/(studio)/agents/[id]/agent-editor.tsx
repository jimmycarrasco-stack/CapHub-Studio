"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, Badge, Button, Card, cx, Field, Input, Spinner, Textarea, timeAgo, toast, Toggle } from "@/components/ui";
import { PROVIDER_LABELS, type ProviderName } from "@/lib/llm/catalog";
import type { Agent, KnowledgeItem } from "@/lib/repo";

type Tab = "configure" | "knowledge" | "deploy" | "conversations";
type ConfigFields = Pick<Agent, "name" | "description" | "greeting" | "instructions" | "guardrails" | "provider" | "model" | "temperature">;

const pick = (a: Agent): ConfigFields => ({
  name: a.name,
  description: a.description,
  greeting: a.greeting,
  instructions: a.instructions,
  guardrails: a.guardrails,
  provider: a.provider,
  model: a.model,
  temperature: a.temperature,
});

export function AgentEditor({
  initialAgent,
  initialKnowledge,
  baseUrl,
  activeProvider,
  providerModels,
}: {
  initialAgent: Agent;
  initialKnowledge: KnowledgeItem[];
  baseUrl: string;
  activeProvider: ProviderName;
  providerModels: Record<ProviderName, string>;
}) {
  const router = useRouter();
  const [agent, setAgent] = useState(initialAgent);
  const [form, setForm] = useState<ConfigFields>(pick(initialAgent));
  const [knowledge, setKnowledge] = useState(initialKnowledge);
  const [tab, setTab] = useState<Tab>("configure");
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(pick(agent));
  const set = <K extends keyof ConfigFields>(k: K, v: ConfigFields[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const updated = await api<Agent>(`/api/agents/${agent.id}`, { method: "PATCH", json: form });
      setAgent(updated);
      setForm(pick(updated));
      toast("Agent saved", "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function patchWidget(body: Partial<Pick<Agent, "widget_enabled" | "widget_color">>) {
    try {
      const updated = await api<Agent>(`/api/agents/${agent.id}`, { method: "PATCH", json: body });
      setAgent(updated);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function remove() {
    if (!confirm(`Delete "${agent.name}"? Its knowledge and conversation history will be permanently deleted, and it will be removed from any sites.`)) return;
    try {
      await api(`/api/agents/${agent.id}`, { method: "DELETE" });
      router.push("/agents");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const effectiveProvider: ProviderName = agent.provider === "default" ? activeProvider : agent.provider;
  const effectiveModel = agent.model || providerModels[effectiveProvider];

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/agents" className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" aria-label="Back to agents">
          ←
        </Link>
        <span className="size-3 rounded-full" style={{ background: agent.widget_color }} />
        <h1 className="text-lg font-semibold text-zinc-900">{agent.name}</h1>
        {agent.widget_enabled ? <Badge tone="green">Widget live</Badge> : <Badge>Widget off</Badge>}
        <span className="text-xs text-zinc-500">
          {PROVIDER_LABELS[effectiveProvider]} · <span className="font-mono">{effectiveModel}</span>
        </span>
        <div className="ml-auto flex gap-2">
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setForm(pick(agent))}>
              Discard
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-zinc-200/60 p-1">
            {(["configure", "knowledge", "deploy", "conversations"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cx("flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium capitalize", tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}
              >
                {t}
                {t === "knowledge" && <span className="ml-1 text-zinc-400">{knowledge.length}</span>}
              </button>
            ))}
          </div>

          {tab === "configure" && (
            <Card className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name">
                  <Input id="name" maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Short description" htmlFor="description">
                  <Input id="description" maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} />
                </Field>
              </div>
              <Field label="Greeting" htmlFor="greeting" hint="First message visitors see in the widget.">
                <Input id="greeting" maxLength={500} value={form.greeting} onChange={(e) => set("greeting", e.target.value)} />
              </Field>
              <Field label="Instructions" htmlFor="instructions" hint="Role, goal, tone, and the steps the agent should follow.">
                <Textarea id="instructions" rows={9} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
              </Field>
              <Field label="Guardrails" htmlFor="guardrails" hint="Things the agent must never do or say. One per line works well.">
                <Textarea
                  id="guardrails"
                  rows={4}
                  value={form.guardrails}
                  onChange={(e) => set("guardrails", e.target.value)}
                  placeholder={"- Never quote exact prices; offer a free estimate instead\n- Don't give medical or legal advice"}
                />
              </Field>

              <div className="rounded-xl bg-zinc-50 p-4">
                <h3 className="mb-3 text-[13px] font-semibold text-zinc-800">Model</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Provider" htmlFor="provider">
                    <select
                      id="provider"
                      value={form.provider}
                      onChange={(e) => set("provider", e.target.value as Agent["provider"])}
                      className="h-9 w-full rounded-lg bg-white px-2 text-sm ring-1 ring-zinc-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    >
                      <option value="default">Use active provider ({PROVIDER_LABELS[activeProvider]})</option>
                      <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
                      <option value="openai">{PROVIDER_LABELS.openai}</option>
                    </select>
                  </Field>
                  <Field label="Model override" htmlFor="model" hint="Blank = provider's configured model">
                    <Input
                      id="model"
                      className="font-mono"
                      placeholder={providerModels[form.provider === "default" ? activeProvider : form.provider]}
                      value={form.model ?? ""}
                      onChange={(e) => set("model", e.target.value || null)}
                    />
                  </Field>
                  <Field label={`Temperature${form.temperature == null ? " (model default)" : `: ${form.temperature.toFixed(1)}`}`} htmlFor="temp">
                    <div className="flex h-9 items-center gap-2">
                      <input
                        id="temp"
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        disabled={form.temperature == null}
                        value={form.temperature ?? 0.7}
                        onChange={(e) => set("temperature", Number(e.target.value))}
                        className="flex-1 accent-brand-600"
                      />
                      <label className="flex items-center gap-1 text-xs text-zinc-600">
                        <input type="checkbox" checked={form.temperature == null} onChange={(e) => set("temperature", e.target.checked ? null : 0.7)} />
                        Default
                      </label>
                    </div>
                  </Field>
                </div>
                <p className="mt-2 text-xs text-zinc-500">Some reasoning models ignore or reject custom temperature — leave it on Default if you see errors.</p>
              </div>

              <div className="flex justify-between border-t border-zinc-100 pt-4">
                <Button variant="danger" size="sm" onClick={remove}>
                  Delete agent
                </Button>
                <Button variant="primary" disabled={!dirty} loading={saving} onClick={save}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

          {tab === "knowledge" && <KnowledgePanel agentId={agent.id} items={knowledge} onChange={setKnowledge} />}

          {tab === "deploy" && <DeployPanel agent={agent} baseUrl={baseUrl} onPatch={patchWidget} />}

          {tab === "conversations" && <ConversationsPanel agentId={agent.id} />}
        </div>

        <Playground agent={agent} dirty={dirty} />
      </div>
    </div>
  );
}

// ───────────────────────── Knowledge ─────────────────────────

function KnowledgePanel({ agentId, items, onChange }: { agentId: string; items: KnowledgeItem[]; onChange: (k: KnowledgeItem[]) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function add(t = title, c = content) {
    setSaving(true);
    try {
      const item = await api<KnowledgeItem>(`/api/agents/${agentId}/knowledge`, { method: "POST", json: { title: t, content: c } });
      onChange([...items, item]);
      setTitle("");
      setContent("");
      toast(`Added "${item.title}"`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function upload(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      if (file.size > 2_000_000) {
        toast(`${file.name} is over 2 MB — paste the relevant parts instead.`, "error");
        continue;
      }
      await add(file.name.replace(/\.[^.]+$/, ""), await file.text());
    }
  }

  async function remove(item: KnowledgeItem) {
    if (!confirm(`Remove "${item.title}" from this agent's knowledge?`)) return;
    try {
      await api(`/api/agents/${agentId}/knowledge/${item.id}`, { method: "DELETE" });
      onChange(items.filter((k) => k.id !== item.id));
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Add knowledge</h3>
          <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50">
            Upload .txt / .md / .csv
            <input type="file" accept=".txt,.md,.markdown,.csv,.json,text/plain" multiple className="sr-only" onChange={(e) => upload(e.target.files).finally(() => (e.target.value = ""))} />
          </label>
        </div>
        <Field label="Title" htmlFor="k-title">
          <Input id="k-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Services & pricing, FAQ, Hours and location" />
        </Field>
        <Field label="Content" htmlFor="k-content" hint="Paste FAQs, service details, policies, pricing — anything the agent should know.">
          <Textarea id="k-content" rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
        <Button variant="primary" loading={saving} disabled={!title.trim() || !content.trim()} onClick={() => add()}>
          Add to knowledge base
        </Button>
      </Card>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          No knowledge yet. Without it, the agent will only know what&apos;s in its instructions.
        </p>
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100">
            {items.map((k) => (
              <li key={k.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => setOpen(open === k.id ? null : k.id)} aria-expanded={open === k.id}>
                    <div className="truncate text-sm font-medium text-zinc-900">{k.title}</div>
                    <div className="text-xs text-zinc-500">
                      {k.content.length.toLocaleString()} characters · {timeAgo(k.created_at)}
                    </div>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => remove(k)}>
                    Remove
                  </Button>
                </div>
                {open === k.id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs whitespace-pre-wrap text-zinc-700">{k.content}</pre>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── Deploy ─────────────────────────

function DeployPanel({ agent, baseUrl, onPatch }: { agent: Agent; baseUrl: string; onPatch: (b: Partial<Pick<Agent, "widget_enabled" | "widget_color">>) => Promise<void> }) {
  const [color, setColor] = useState(agent.widget_color);
  const snippet = `<script src="${baseUrl}/widget.js" data-agent="${agent.id}" defer></script>`;

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Public chat widget</h3>
          <p className="text-xs text-zinc-500">When on, anyone visiting a page with the widget can chat with this agent. Usage is rate limited.</p>
        </div>
        <Toggle checked={agent.widget_enabled} onChange={(v) => onPatch({ widget_enabled: v })} label="Enable public widget" />
      </div>

      <Field label="Widget color" htmlFor="color">
        <div className="flex items-center gap-2">
          <input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg ring-1 ring-zinc-200" />
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-32 font-mono" aria-label="Hex color" />
          <Button size="sm" disabled={color === agent.widget_color || !/^#[0-9a-fA-F]{6}$/.test(color)} onClick={() => onPatch({ widget_color: color })}>
            Save color
          </Button>
        </div>
      </Field>

      <div className="space-y-2">
        <h3 className="text-[13px] font-medium text-zinc-700">Add to a CapHub site</h3>
        <p className="text-sm text-zinc-600">
          Open a site in the <Link href="/sites" className="font-medium text-brand-700 hover:underline">Site Builder</Link> and pick this agent in the <em>Chat agent</em> menu.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-medium text-zinc-700">Embed on any website</h3>
        <p className="text-xs text-zinc-500">Paste before the closing &lt;/body&gt; tag. {baseUrl.includes("localhost") && "Set PUBLIC_BASE_URL once this is deployed so the snippet points at your public domain."}</p>
        <div className="flex gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-900 px-3 py-2.5 font-mono text-xs whitespace-nowrap text-zinc-100">{snippet}</code>
          <Button
            size="sm"
            onClick={() =>
              navigator.clipboard.writeText(snippet).then(
                () => toast("Embed code copied", "success"),
                () => toast("Couldn't copy — select the code and copy it manually", "error"),
              )
            }
          >
            Copy
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────── Conversations ─────────────────────────

type ConvRow = { id: string; source: string; updated_at: string; message_count: number; first_message: string | null };

function ConversationsPanel({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<ConvRow[] | null>(null);
  const [open, setOpen] = useState<{ id: string; messages: { role: string; content: string }[] } | null>(null);

  useEffect(() => {
    api<ConvRow[]>(`/api/agents/${agentId}/conversations`).then(setRows).catch((e) => toast(e.message, "error"));
  }, [agentId]);

  async function view(id: string) {
    try {
      setOpen({ id, messages: await api(`/api/agents/${agentId}/conversations/${id}`) });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  if (rows === null) return <Spinner />;
  if (open)
    return (
      <Card className="p-4">
        <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
          ← All conversations
        </Button>
        <div className="mt-3 space-y-2">
          {open.messages.map((m, i) => (
            <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap", m.role === "user" ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-800")}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  if (!rows.length) return <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">No conversations yet.</p>;
  return (
    <Card>
      <ul className="divide-y divide-zinc-100">
        {rows.map((c) => (
          <li key={c.id}>
            <button onClick={() => view(c.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50">
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-900">{c.first_message || "(no messages)"}</div>
                <div className="text-xs text-zinc-500">
                  {c.message_count} messages · {timeAgo(c.updated_at)}
                </div>
              </div>
              <Badge tone={c.source === "widget" ? "brand" : "zinc"}>{c.source}</Badge>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────────────────────── Playground ─────────────────────────

function Playground({ agent, dirty }: { agent: Agent; dirty: boolean }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant" | "error"; content: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await api<{ conversationId: string; reply: string; provider: string; model: string }>(`/api/agents/${agent.id}/chat`, {
        method: "POST",
        json: { message: text, conversationId },
      });
      setConversationId(r.conversationId);
      setMeta(`${r.provider} · ${r.model}`);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", content: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-[640px] flex-col overflow-hidden lg:sticky lg:top-6">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Test playground</h2>
          <p className="text-[11px] text-zinc-500">{meta ?? "Uses the agent's saved settings and knowledge"}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setMessages([]);
            setConversationId(undefined);
            setMeta(null);
          }}
        >
          Reset
        </Button>
      </div>
      {dirty && <div className="bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">You have unsaved changes — save them to test.</div>}
      <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-zinc-50 p-4">
        {agent.greeting && (
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-zinc-800 ring-1 ring-zinc-200">{agent.greeting}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                m.role === "user" && "rounded-br-md text-white",
                m.role === "assistant" && "rounded-bl-md bg-white text-zinc-800 ring-1 ring-zinc-200",
                m.role === "error" && "bg-red-50 text-red-800 ring-1 ring-red-200",
              )}
              style={m.role === "user" ? { background: agent.widget_color } : undefined}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 text-sm text-zinc-500 ring-1 ring-zinc-200">
            <Spinner className="size-3.5" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-zinc-100 p-3">
        <Input aria-label="Message the agent" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask something a visitor would…" disabled={busy} />
        <Button variant="primary" disabled={!input.trim() || busy}>
          Send
        </Button>
      </form>
    </Card>
  );
}
