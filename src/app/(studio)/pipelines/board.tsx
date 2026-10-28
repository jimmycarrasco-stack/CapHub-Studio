"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, Badge, Button, cx, Field, Input, Modal, money, Select, toast, toCents } from "@/components/ui";
import type { Opportunity, Pipeline } from "@/lib/crm/pipelines";

type Deal = Opportunity;
type Status = "open" | "won" | "lost";

export function NewPipelineButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [stages, setStages] = useState("New lead\nContacted\nProposal sent\nNegotiation\nClosed");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const p = await api<{ id: string }>("/api/pipelines", { method: "POST", json: { name, stages: stages.split("\n").map((s) => s.trim()).filter(Boolean) } });
      setOpen(false);
      router.push(`/pipelines?p=${p.id}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>New pipeline</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New pipeline">
        <div className="space-y-3">
          <Field label="Name" htmlFor="pn">
            <Input id="pn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales, Onboarding, Hiring" autoFocus />
          </Field>
          <Field label="Stages" hint="One per line, in order" htmlFor="ps">
            <textarea id="ps" rows={6} value={stages} onChange={(e) => setStages(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm ring-1 ring-zinc-200 focus:ring-2 focus:ring-brand-500 focus:outline-none" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim() || !stages.trim()} onClick={create}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function Board({
  pipelines,
  pipeline,
  initialDeals,
  canDelete,
  currency,
}: {
  pipelines: { id: string; name: string }[];
  pipeline: Pipeline;
  initialDeals: Deal[];
  canDelete: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState(initialDeals);
  const [filter, setFilter] = useState<Status | "all">("open");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | "new" | null>(null);
  const [newStage, setNewStage] = useState<string | null>(null);
  const [stagesOpen, setStagesOpen] = useState(false);

  const visible = useMemo(() => deals.filter((d) => filter === "all" || d.status === filter), [deals, filter]);
  const byStage = (stageId: string) => visible.filter((d) => d.stage_id === stageId).sort((a, b) => a.position - b.position);
  const totals = (stageId: string) => byStage(stageId).reduce((s, d) => s + d.value_cents, 0);

  async function move(dealId: string, stageId: string, beforeId: string | null) {
    const list = deals.filter((d) => d.stage_id === stageId && d.id !== dealId).sort((a, b) => a.position - b.position);
    const idx = beforeId ? list.findIndex((d) => d.id === beforeId) : list.length;
    const prev = list[idx - 1]?.position;
    const next = list[idx]?.position;
    const position = prev === undefined && next === undefined ? 1 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    const before = deals;
    setDeals(deals.map((d) => (d.id === dealId ? { ...d, stage_id: stageId, position } : d)));
    try {
      await api(`/api/opportunities/${dealId}`, { method: "PATCH", json: { stageId, position } });
    } catch (e) {
      setDeals(before);
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Pipeline" value={pipeline.id} onChange={(e) => router.push(`/pipelines?p=${e.target.value}`)} className="w-auto min-w-[180px] font-medium">
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-zinc-200" role="group" aria-label="Deal status filter">
          {(["open", "won", "lost", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={cx("rounded-md px-3 py-1 text-xs font-medium capitalize", filter === s ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setStagesOpen(true)}>
            Edit pipeline
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setNewStage(pipeline.stages[0]?.id ?? null);
              setEditing("new");
            }}
          >
            + Deal
          </Button>
        </div>
      </div>

      <div className="scroll-thin -mx-6 flex min-h-[420px] flex-1 gap-3 overflow-x-auto px-6 pb-4 md:-mx-10 md:px-10">
        {pipeline.stages.map((s) => (
          <section
            key={s.id}
            aria-label={s.name}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(s.id);
            }}
            onDragLeave={() => setOverStage((x) => (x === s.id ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              setOverStage(null);
              const id = e.dataTransfer.getData("text/plain") || dragId;
              if (id) void move(id, s.id, null);
              setDragId(null);
            }}
            className={cx("flex w-72 shrink-0 flex-col rounded-xl bg-zinc-100/80 ring-1 ring-zinc-200", overStage === s.id && "ring-2 ring-brand-400")}
          >
            <header className="flex items-center justify-between px-3 pt-3 pb-2">
              <h2 className="truncate text-sm font-semibold">{s.name}</h2>
              <span className="text-xs text-zinc-500">
                {byStage(s.id).length} · {money(totals(s.id), currency)}
              </span>
            </header>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {byStage(s.id).map((d) => (
                <li
                  key={d.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(d.id);
                    e.dataTransfer.setData("text/plain", d.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOverStage(null);
                    const id = e.dataTransfer.getData("text/plain") || dragId;
                    if (id && id !== d.id) void move(id, s.id, d.id);
                    setDragId(null);
                  }}
                  className={cx("cursor-grab rounded-lg bg-white p-3 shadow-sm ring-1 ring-zinc-200 hover:ring-zinc-300 active:cursor-grabbing", dragId === d.id && "opacity-50")}
                >
                  <button type="button" onClick={() => setEditing(d)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900">{d.title}</span>
                      {d.status !== "open" && <Badge tone={d.status === "won" ? "green" : "red"}>{d.status}</Badge>}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span className="truncate">{d.contact_name || d.contact_email || "No contact"}</span>
                      <span className="tabular-nums">{money(d.value_cents, currency)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setNewStage(s.id);
                setEditing("new");
              }}
              className="mx-2 mb-2 rounded-lg py-1.5 text-xs font-medium text-zinc-500 hover:bg-white hover:text-zinc-800"
            >
              + Add deal
            </button>
          </section>
        ))}
      </div>

      {editing && (
        <DealModal
          deal={editing === "new" ? null : editing}
          pipeline={pipeline}
          stageId={editing === "new" ? newStage : editing.stage_id}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={(d, removed) => {
            setDeals((prev) => (removed ? prev.filter((x) => x.id !== d.id) : prev.some((x) => x.id === d.id) ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d]));
            setEditing(null);
          }}
        />
      )}
      {stagesOpen && <PipelineSettings pipeline={pipeline} canDelete={canDelete} onClose={() => setStagesOpen(false)} />}
    </div>
  );
}

function ContactPicker({ value, label, onChange }: { value: string | null; label: string | null; onChange: (id: string | null, label: string | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      api<{ contacts: { id: string; first_name: string; last_name: string; email: string | null }[] }>(`/api/contacts?limit=8&q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.contacts.map((c) => ({ id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed" }))))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value)
    return (
      <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200">
        <Link href={`/contacts/${value}`} className="truncate font-medium hover:text-brand-700">
          {label || "Contact"}
        </Link>
        <button type="button" onClick={() => onChange(null, null)} className="text-xs text-zinc-500 hover:text-red-600">
          Remove
        </button>
      </div>
    );
  return (
    <div className="relative">
      <Input aria-label="Search contacts" placeholder="Search contacts…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && results.length > 0 && (
        <ul className="absolute inset-x-0 top-10 z-10 max-h-56 overflow-y-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-zinc-200">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
                onClick={() => {
                  onChange(r.id, r.label);
                  setQ("");
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DealModal({
  deal,
  pipeline,
  stageId,
  currency,
  onClose,
  onSaved,
}: {
  deal: Deal | null;
  pipeline: Pipeline;
  stageId: string | null;
  currency: string;
  onClose: () => void;
  onSaved: (d: Deal, removed?: boolean) => void;
}) {
  const [title, setTitle] = useState(deal?.title ?? "");
  const [value, setValue] = useState(deal ? (deal.value_cents / 100).toFixed(2) : "");
  const [stage, setStage] = useState(stageId ?? pipeline.stages[0]?.id ?? "");
  const [contact, setContact] = useState<{ id: string | null; label: string | null }>({ id: deal?.contact_id ?? null, label: deal?.contact_name || deal?.contact_email || null });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  async function save(status?: Status) {
    const cents = toCents(value || "0");
    if (cents === null) return toast("Enter a valid amount", "error");
    setBusy(true);
    try {
      const d = deal
        ? await api<Deal>(`/api/opportunities/${deal.id}`, { method: "PATCH", json: { title, valueCents: cents, stageId: stage, contactId: contact.id, ...(status ? { status } : {}) } })
        : await api<Deal>("/api/opportunities", { method: "POST", json: { pipelineId: pipeline.id, stageId: stage, title, valueCents: cents, contactId: contact.id } });
      onSaved(d);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function remove() {
    if (!deal) return;
    try {
      await api(`/api/opportunities/${deal.id}`, { method: "DELETE" });
      onSaved(deal, true);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <Modal open onClose={onClose} title={deal ? "Edit deal" : "New deal"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Deal name" htmlFor="dn">
          <Input id="dn" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="e.g. Website redesign — Acme" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Value (${currency.toUpperCase()})`} htmlFor="dv">
            <Input id="dv" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Stage" htmlFor="ds">
            <Select id="ds" value={stage} onChange={(e) => setStage(e.target.value)}>
              {pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Contact">
          <ContactPicker value={contact.id} label={contact.label} onChange={(id, label) => setContact({ id, label })} />
        </Field>

        {deal && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2.5 text-sm">
            <span className="text-zinc-600">
              Status: <strong className="capitalize">{deal.status}</strong>
            </span>
            <span className="ml-auto flex gap-1.5">
              {deal.status !== "won" && (
                <Button type="button" size="sm" onClick={() => save("won")}>
                  Mark won
                </Button>
              )}
              {deal.status !== "lost" && (
                <Button type="button" size="sm" onClick={() => save("lost")}>
                  Mark lost
                </Button>
              )}
              {deal.status !== "open" && (
                <Button type="button" size="sm" onClick={() => save("open")}>
                  Reopen
                </Button>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {deal ? (
            confirmDel ? (
              <span className="flex items-center gap-2 text-xs">
                Delete this deal?
                <Button type="button" size="sm" variant="danger" onClick={remove}>
                  Delete
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(true)}>
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!title.trim()}>
              {deal ? "Save" : "Create deal"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function PipelineSettings({ pipeline, canDelete, onClose }: { pipeline: Pipeline; canDelete: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(pipeline.name);
  const [stages, setStages] = useState<{ id?: string; name: string }[]>(pipeline.stages.map((s) => ({ id: s.id, name: s.name })));
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const moveStage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
  };

  async function save() {
    setBusy(true);
    try {
      await api(`/api/pipelines/${pipeline.id}`, { method: "PATCH", json: { name, stages: stages.filter((s) => s.name.trim()) } });
      onClose();
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
      onClose();
      router.push("/pipelines");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit pipeline">
      <div className="space-y-4">
        <Field label="Name" htmlFor="epn">
          <Input id="epn" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <div className="text-[13px] font-medium text-zinc-700">Stages</div>
          {stages.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex items-center gap-1.5">
              <Input aria-label={`Stage ${i + 1}`} value={s.name} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button type="button" aria-label="Move up" onClick={() => moveStage(i, -1)} disabled={i === 0} className="px-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-30">
                ↑
              </button>
              <button type="button" aria-label="Move down" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1} className="px-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-30">
                ↓
              </button>
              <button type="button" aria-label="Remove stage" onClick={() => setStages(stages.filter((_, j) => j !== i))} disabled={stages.length === 1} className="px-1 text-zinc-400 hover:text-red-600 disabled:opacity-30">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setStages([...stages, { name: "" }])} className="text-xs font-medium text-brand-600 hover:underline">
            + Add stage
          </button>
          <p className="text-xs text-zinc-500">Stages that still have deals can&apos;t be removed.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </div>
        {canDelete && (
          <div className="space-y-2 border-t border-zinc-100 pt-4">
            <div className="text-[13px] font-medium text-red-700">Delete pipeline</div>
            <p className="text-xs text-zinc-500">
              Permanently deletes this pipeline and all its deals. Type <strong>{pipeline.name}</strong> to confirm.
            </p>
            <div className="flex gap-2">
              <Input aria-label="Confirm pipeline name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              <Button variant="danger" disabled={confirmName !== pipeline.name} onClick={remove}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
