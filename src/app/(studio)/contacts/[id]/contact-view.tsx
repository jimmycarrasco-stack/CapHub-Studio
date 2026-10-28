"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Badge, Button, Card, cx, Field, Input, Modal, money, Select, Textarea, timeAgo, toast, toCents, Toggle } from "@/components/ui";
import type { Activity, Contact, Task } from "@/lib/crm/contacts";
import type { MessageRow } from "@/lib/crm/email";
import type { Order } from "@/lib/crm/payments";
import type { Opportunity } from "@/lib/crm/pipelines";
import type { Run } from "@/lib/crm/automations";
import { TaskList } from "../task-list";

type Deal = Opportunity & { pipeline_name: string; stage_name: string };

const TABS = ["Activity", "Email", "Tasks", "Deals", "Payments", "Automations"] as const;
type Tab = (typeof TABS)[number];

const ACTIVITY_ICON: Record<string, string> = { note: "📝", email: "✉️", payment: "💳", form: "📋", tag_added: "🏷", tag_removed: "🏷", opportunity: "📊", task: "☑️", automation: "⚡", created: "✨" };

export function ContactView(props: {
  contact: Contact;
  activities: Activity[];
  tasks: Task[];
  deals: Deal[];
  orders: Order[];
  messages: MessageRow[];
  runs: Run[];
  automations: { id: string; name: string; enabled: boolean }[];
  pipelines: { id: string; name: string }[];
  allTags: string[];
  emailReady: boolean;
}) {
  const { contact: c } = props;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Activity");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Unnamed contact";

  async function remove() {
    try {
      await api(`/api/contacts/${c.id}`, { method: "DELETE" });
      toast("Contact deleted", "success");
      router.push("/contacts");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <Link href="/contacts" className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
        ← Contacts
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full bg-brand-50 text-base font-semibold text-brand-700">{name.slice(0, 1).toUpperCase()}</div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-zinc-500">
              {[c.company, c.source && `via ${c.source}`, `added ${timeAgo(c.created_at)}`].filter(Boolean).join(" · ")}
              {c.dnd && (
                <span className="ml-2">
                  <Badge tone="red">Do not contact</Badge>
                </span>
              )}
            </p>
          </div>
        </div>
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
          Delete contact
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <DetailsCard contact={c} onSaved={() => router.refresh()} />
          <TagsCard contact={c} allTags={props.allTags} onSaved={() => router.refresh()} />
        </div>

        <div className="min-w-0">
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium", tab === t ? "border-brand-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}
              >
                {t}
                {t === "Tasks" && props.tasks.filter((x) => !x.done).length > 0 && <span className="ml-1 text-xs text-zinc-400">{props.tasks.filter((x) => !x.done).length}</span>}
                {t === "Deals" && props.deals.length > 0 && <span className="ml-1 text-xs text-zinc-400">{props.deals.length}</span>}
              </button>
            ))}
          </div>

          {tab === "Activity" && <ActivityTab contactId={c.id} activities={props.activities} onChange={() => router.refresh()} />}
          {tab === "Email" && <EmailTab contact={c} messages={props.messages} ready={props.emailReady} onSent={() => router.refresh()} />}
          {tab === "Tasks" && (
            <Card className="p-4">
              <TaskList initial={props.tasks} contactId={c.id} compact />
            </Card>
          )}
          {tab === "Deals" && <DealsTab contactId={c.id} contactName={name} deals={props.deals} pipelines={props.pipelines} onChange={() => router.refresh()} />}
          {tab === "Payments" && <PaymentsTab orders={props.orders} />}
          {tab === "Automations" && <AutomationsTab contactId={c.id} runs={props.runs} automations={props.automations} onChange={() => router.refresh()} />}
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete contact?">
        <p className="text-sm text-zinc-600">
          This permanently deletes <strong>{name}</strong> with their notes, tasks and message history. Deals and payments are kept but unlinked. This can&apos;t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove}>
            Delete permanently
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function DetailsCard({ contact: c, onSaved }: { contact: Contact; onSaved: () => void }) {
  const [f, setF] = useState({ first_name: c.first_name, last_name: c.last_name, email: c.email ?? "", phone: c.phone ?? "", company: c.company });
  const [custom, setCustom] = useState(Object.entries(c.custom));
  const [dnd, setDnd] = useState(c.dnd);
  const [busy, setBusy] = useState(false);
  const dirty =
    JSON.stringify(f) !== JSON.stringify({ first_name: c.first_name, last_name: c.last_name, email: c.email ?? "", phone: c.phone ?? "", company: c.company }) ||
    JSON.stringify(custom) !== JSON.stringify(Object.entries(c.custom)) ||
    dnd !== c.dnd;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      await api(`/api/contacts/${c.id}`, {
        method: "PATCH",
        json: { ...f, phone: f.phone || null, dnd, custom: Object.fromEntries(custom.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])) },
      });
      toast("Saved", "success");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Details</h2>
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name" htmlFor="d-fn">
          <Input id="d-fn" value={f.first_name} onChange={set("first_name")} />
        </Field>
        <Field label="Last name" htmlFor="d-ln">
          <Input id="d-ln" value={f.last_name} onChange={set("last_name")} />
        </Field>
      </div>
      <Field label="Email" htmlFor="d-em">
        <Input id="d-em" type="email" value={f.email} onChange={set("email")} />
      </Field>
      <Field label="Phone" htmlFor="d-ph">
        <Input id="d-ph" type="tel" value={f.phone} onChange={set("phone")} />
      </Field>
      <Field label="Company" htmlFor="d-co">
        <Input id="d-co" value={f.company} onChange={set("company")} />
      </Field>

      <div className="space-y-2 pt-1">
        <div className="text-[13px] font-medium text-zinc-700">Custom fields</div>
        {custom.map(([k, v], i) => (
          <div key={i} className="flex gap-1.5">
            <Input aria-label="Field name" value={k} placeholder="Field" onChange={(e) => setCustom(custom.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} className="w-2/5" />
            <Input aria-label="Field value" value={v} placeholder="Value" onChange={(e) => setCustom(custom.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
            <button type="button" aria-label="Remove field" onClick={() => setCustom(custom.filter((_, j) => j !== i))} className="px-1 text-zinc-400 hover:text-red-600">
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setCustom([...custom, ["", ""]])} className="text-xs font-medium text-brand-600 hover:underline">
          + Add field
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 pt-1 text-sm">
        <span>
          Do not contact
          <span className="block text-xs text-zinc-500">Automations and emails skip this contact</span>
        </span>
        <Toggle checked={dnd} onChange={setDnd} label="Do not contact" />
      </label>

      {dirty && (
        <Button variant="primary" className="w-full" loading={busy} onClick={save}>
          Save changes
        </Button>
      )}
    </Card>
  );
}

function TagsCard({ contact: c, allTags, onSaved }: { contact: Contact; allTags: string[]; onSaved: () => void }) {
  const [tag, setTag] = useState("");
  const save = async (tags: string[]) => {
    try {
      await api(`/api/contacts/${c.id}`, { method: "PATCH", json: { tags } });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Tags</h2>
      <div className="flex flex-wrap gap-1.5">
        {c.tags.length === 0 && <span className="text-sm text-zinc-500">No tags</span>}
        {c.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-2.5 text-xs font-medium text-zinc-700">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => save(c.tags.filter((x) => x !== t))} className="rounded-full px-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700">
              ✕
            </button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (tag.trim()) void save([...c.tags, tag.trim()]).then(() => setTag(""));
        }}
      >
        <Input aria-label="New tag" list="all-tags" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag…" />
        <datalist id="all-tags">
          {allTags.filter((t) => !c.tags.includes(t)).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Button type="submit" disabled={!tag.trim()} aria-label="Add tag">
          Add
        </Button>
      </form>
      <p className="text-xs text-zinc-500">Adding a tag can start automations.</p>
    </Card>
  );
}

function ActivityTab({ contactId, activities, onChange }: { contactId: string; activities: Activity[]; onChange: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await api(`/api/contacts/${contactId}/notes`, { method: "POST", json: { text: note } });
      setNote("");
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function del(id: number) {
    try {
      await api(`/api/contacts/${contactId}/notes?noteId=${id}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  return (
    <div className="space-y-4">
      <Card className="p-3">
        <Textarea aria-label="New note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a note…" className="resize-none ring-0 focus:ring-0" />
        <div className="flex justify-end">
          <Button size="sm" variant="primary" loading={busy} disabled={!note.trim()} onClick={add}>
            Add note
          </Button>
        </div>
      </Card>
      {activities.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet.</p>
      ) : (
        <ol className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="group flex gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm ring-1 ring-zinc-200" aria-hidden="true">
                {ACTIVITY_ICON[a.type] ?? "•"}
              </span>
              <div className={cx("min-w-0 flex-1", a.type === "note" && "rounded-lg bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100")}>
                <p className="text-sm whitespace-pre-wrap text-zinc-800">{a.summary}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {timeAgo(a.created_at)}
                  {a.user_name ? ` · ${a.user_name}` : ""}
                  {a.type === "note" && (
                    <button type="button" onClick={() => del(a.id)} className="ml-2 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100">
                      Delete
                    </button>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EmailTab({ contact: c, messages, ready, onSent }: { contact: Contact; messages: MessageRow[]; ready: boolean; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api(`/api/contacts/${c.id}/email`, { method: "POST", json: { subject, body } });
      toast("Email sent", "success");
      setSubject("");
      setBody("");
      onSent();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {!ready ? (
        <Card className="p-4 text-sm text-zinc-600">
          Email sending isn&apos;t set up for this sub-account yet.{" "}
          <Link href="/settings#email" className="font-medium text-brand-600 hover:underline">
            Set it up in Settings →
          </Link>
        </Card>
      ) : !c.email ? (
        <Card className="p-4 text-sm text-zinc-600">Add an email address to this contact to email them.</Card>
      ) : (
        <Card className="space-y-3 p-4">
          <div className="text-xs text-zinc-500">
            To <span className="font-medium text-zinc-800">{c.email}</span>
            {c.dnd && <span className="ml-2 text-red-600">This contact is marked do-not-contact; the email will be blocked.</span>}
          </div>
          <Input aria-label="Subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea aria-label="Message" rows={7} placeholder={"Hi {{contact.first_name}},\n\n…"} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Merge fields: {"{{contact.first_name}}"}, {"{{business.name}}"}</span>
            <Button variant="primary" loading={busy} disabled={!subject.trim() || !body.trim()} onClick={send}>
              Send email
            </Button>
          </div>
        </Card>
      )}
      <MessageList messages={messages} />
    </div>
  );
}

export function MessageList({ messages, showContact }: { messages: MessageRow[]; showContact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!messages.length) return <p className="text-sm text-zinc-500">No emails yet.</p>;
  return (
    <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
      {messages.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50" aria-expanded={open === m.id}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-900">{m.subject || "(no subject)"}</div>
              <div className="truncate text-xs text-zinc-500">
                {showContact && m.contact_id ? `${m.contact_name || m.to_addr} · ` : ""}to {m.to_addr}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {m.status === "sent" ? <Badge tone="green">Sent</Badge> : <Badge tone="red">{m.status}</Badge>}
              <div className="mt-1 text-xs text-zinc-400">{timeAgo(m.created_at)}</div>
            </div>
          </button>
          {open === m.id && (
            <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-sm whitespace-pre-wrap text-zinc-700">
              {m.error && <p className="mb-2 text-xs text-red-600">Error: {m.error}</p>}
              {m.body}
              {showContact && m.contact_id && (
                <Link href={`/contacts/${m.contact_id}`} className="mt-3 block text-xs font-medium text-brand-600 hover:underline">
                  Open contact →
                </Link>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function DealsTab({ contactId, contactName, deals, pipelines, onChange }: { contactId: string; contactName: string; deals: Deal[]; pipelines: { id: string; name: string }[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ pipelineId: pipelines[0]?.id ?? "", title: contactName, value: "" });
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      await api("/api/opportunities", { method: "POST", json: { pipelineId: f.pipelineId, title: f.title, valueCents: toCents(f.value || "0") ?? 0, contactId } });
      setOpen(false);
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {pipelines.length > 0 ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          + Add to pipeline
        </Button>
      ) : (
        <p className="text-sm text-zinc-500">
          <Link href="/pipelines" className="text-brand-600 hover:underline">
            Create a pipeline
          </Link>{" "}
          to track deals.
        </p>
      )}
      {deals.length === 0 ? (
        <p className="text-sm text-zinc-500">No deals.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
          {deals.map((d) => (
            <li key={d.id}>
              <Link href={`/pipelines?p=${d.pipeline_id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-zinc-500">
                    {d.pipeline_name} · {d.stage_name}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums">{money(d.value_cents)}</div>
                  <Badge tone={d.status === "won" ? "green" : d.status === "lost" ? "red" : "zinc"}>{d.status}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add to pipeline">
        <div className="space-y-3">
          <Field label="Pipeline" htmlFor="dp">
            <Select id="dp" value={f.pipelineId} onChange={(e) => setF({ ...f, pipelineId: e.target.value })}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deal name" htmlFor="dt">
            <Input id="dt" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Value" htmlFor="dv">
            <Input id="dv" inputMode="decimal" placeholder="0.00" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!f.title.trim() || !f.pipelineId || toCents(f.value || "0") === null} onClick={create}>
              Add deal
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PaymentsTab({ orders }: { orders: Order[] }) {
  if (!orders.length) return <p className="text-sm text-zinc-500">No payments from this contact yet.</p>;
  return (
    <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
      {orders.map((o) => (
        <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-sm font-medium">{o.product_name || "Payment"}</div>
            <div className="text-xs text-zinc-500">
              {o.kind === "renewal" ? "Subscription renewal" : o.kind === "subscription" ? "Subscription" : "One-time"} · {timeAgo(o.created_at)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm tabular-nums">{money(o.amount_cents, o.currency)}</div>
            {o.status !== "paid" && <Badge tone="amber">{o.status}</Badge>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RunStatus({ status }: { status: Run["status"] }) {
  const tone = status === "done" ? "green" : status === "failed" ? "red" : status === "cancelled" ? "zinc" : "brand";
  const label = status === "active" ? "waiting" : status;
  return <Badge tone={tone}>{label}</Badge>;
}

function AutomationsTab({ contactId, runs, automations, onChange }: { contactId: string; runs: Run[]; automations: { id: string; name: string; enabled: boolean }[]; onChange: () => void }) {
  const [pick, setPick] = useState(automations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function enroll() {
    setBusy(true);
    try {
      await api(`/api/contacts/${contactId}/enroll`, { method: "POST", json: { automationId: pick } });
      toast("Added to automation", "success");
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: number) {
    try {
      await api(`/api/automation-runs/${id}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  return (
    <div className="space-y-4">
      {automations.length > 0 ? (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <Field label="Run an automation for this contact" htmlFor="enr">
            <Select id="enr" value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-[220px]">
              {automations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.enabled ? "" : " (off)"}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" loading={busy} disabled={!pick} onClick={enroll}>
            Start
          </Button>
        </Card>
      ) : (
        <p className="text-sm text-zinc-500">
          No automations yet.{" "}
          <Link href="/automations" className="text-brand-600 hover:underline">
            Create one →
          </Link>
        </p>
      )}
      {runs.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
          {runs.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/automations/${r.automation_id}`} className="truncate text-sm font-medium hover:text-brand-700">
                  {r.automation_name}
                </Link>
                <div className="flex items-center gap-2">
                  <RunStatus status={r.status} />
                  {r.status === "active" && (
                    <button type="button" onClick={() => cancel(r.id)} className="text-xs text-zinc-400 hover:text-red-600">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {r.log.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-500">
                  {r.log.slice(-4).map((l, i) => (
                    <li key={i} className={cx(!l.ok && "text-red-600")}>
                      {l.ok ? "✓" : "✕"} {l.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1 text-xs text-zinc-400">started {timeAgo(r.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
