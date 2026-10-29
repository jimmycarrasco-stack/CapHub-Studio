"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Button, Card, cx, Field, Input, Modal, Select, Textarea, timeAgo, toast, Toggle } from "@/components/ui";
import { STEPS, TRIGGERS, type Step, type StepType, type Trigger, type TriggerType } from "@/lib/crm/automation-defs";
import type { Automation, Run } from "@/lib/crm/automations";
import { EmailComposer } from "@/components/email-composer";
import { RunStatus } from "../../contacts/[id]/contact-view";

interface Options {
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  products: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  tags: string[];
}

function defaultTrigger(type: TriggerType, o: Options): Trigger {
  switch (type) {
    case "tag_added":
      return { type, tag: "" };
    case "form_submitted":
      return { type };
    case "opportunity_stage_changed":
      return { type, pipelineId: o.pipelines[0]?.id ?? "" };
    case "opportunity_status_changed":
      return { type, status: "won" };
    case "payment_received":
      return { type };
    default:
      return { type } as Trigger;
  }
}

function defaultStep(type: StepType, o: Options): Step {
  const p = o.pipelines[0];
  switch (type) {
    case "send_email":
      return { type, subject: "", body: "Hi {{contact.first_name}},\n\n", ai: false, aiInstructions: "", attachments: [] };
    case "notify_team":
      return { type, to: "", subject: "New activity: {{contact.name}}", body: "{{contact.name}} ({{contact.email}}) just triggered this automation." };
    case "add_tag":
    case "remove_tag":
      return { type, tag: "" };
    case "create_opportunity":
      return { type, pipelineId: p?.id ?? "", stageId: p?.stages[0]?.id, title: "{{contact.name}}", valueCents: 0 };
    case "move_opportunity":
      return { type, pipelineId: p?.id ?? "", stageId: p?.stages[1]?.id ?? p?.stages[0]?.id ?? "" };
    case "create_task":
      return { type, title: "Follow up with {{contact.name}}", dueInDays: 1 };
    case "wait":
      return { type, amount: 1, unit: "days" };
    case "if_tag":
      return { type, tag: "", has: true };
    case "webhook":
      return { type, url: "" };
  }
}

export function AutomationBuilder({ automation, runs, hookUrl, options }: { automation: Automation | null; runs: Run[]; hookUrl: string | null; options: Options }) {
  const router = useRouter();
  const [name, setName] = useState(automation?.name ?? "");
  const [trigger, setTrigger] = useState<Trigger>(automation?.trigger ?? { type: "contact_created" });
  const [steps, setSteps] = useState<Step[]>(automation?.steps ?? []);
  const [enabled, setEnabled] = useState(automation?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saved, setSaved] = useState(JSON.stringify({ name: automation?.name ?? "", trigger: automation?.trigger ?? { type: "contact_created" }, steps: automation?.steps ?? [] }));
  const dirty = saved !== JSON.stringify({ name, trigger, steps });

  async function save() {
    setBusy(true);
    try {
      const json = { name, trigger, steps, enabled };
      if (automation) {
        await api(`/api/automations/${automation.id}`, { method: "PUT", json });
        setSaved(JSON.stringify({ name, trigger, steps }));
        toast("Saved", "success");
        router.refresh();
      } else {
        const a = await api<{ id: string }>("/api/automations", { method: "POST", json });
        router.replace(`/automations/${a.id}`);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(v: boolean) {
    if (!automation) return setEnabled(v);
    setEnabled(v);
    try {
      await api(`/api/automations/${automation.id}`, { method: "PATCH", json: { enabled: v } });
      toast(v ? "Automation is on" : "Automation is off", "success");
    } catch (e) {
      setEnabled(!v);
      toast((e as Error).message, "error");
    }
  }

  async function remove() {
    try {
      await api(`/api/automations/${automation!.id}`, { method: "DELETE" });
      router.push("/automations");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const updateStep = (i: number, s: Step) => setSteps(steps.map((x, j) => (j === i ? s : x)));
  const moveStep = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <Link href="/automations" className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
        ← Automations
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <Input aria-label="Automation name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this automation" className="h-10 max-w-md flex-1 text-base font-semibold" />
        <label className="flex items-center gap-2 text-sm">
          <Toggle checked={enabled} onChange={toggle} label="Automation on" />
          {enabled ? "On" : "Off"}
        </label>
        <Button variant="primary" loading={busy} disabled={!name.trim() || (!!automation && !dirty)} onClick={save}>
          {automation ? (dirty ? "Save changes" : "Saved") : "Create automation"}
        </Button>
      </div>

      <ol className="space-y-0">
        <li>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">When</span>
              <span className="text-sm font-semibold">Trigger</span>
            </div>
            <TriggerEditor trigger={trigger} onChange={setTrigger} options={options} hookUrl={hookUrl} />
          </Card>
        </li>
        {steps.map((s, i) => (
          <li key={i}>
            <Connector />
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">{i + 1}</span>
                  <span className="text-sm font-semibold">{STEPS[s.type].label}</span>
                </div>
                <div className="flex items-center gap-0.5 text-zinc-400">
                  <button type="button" aria-label="Move step up" onClick={() => moveStep(i, -1)} disabled={i === 0} className="px-1.5 hover:text-zinc-800 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label="Move step down" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="px-1.5 hover:text-zinc-800 disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" aria-label="Remove step" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="px-1.5 hover:text-red-600">
                    ✕
                  </button>
                </div>
              </div>
              <StepEditor step={s} onChange={(n) => updateStep(i, n)} options={options} />
            </Card>
          </li>
        ))}
        <li>
          <Connector />
          <button type="button" onClick={() => setAdding(true)} className="w-full rounded-xl border-2 border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-600 hover:border-brand-400 hover:text-brand-700">
            + Add step
          </button>
        </li>
      </ol>

      {automation && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold">Recent runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-zinc-500">No runs yet.{enabled ? "" : " Switch the automation on to start running it."}</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
              {runs.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    {r.contact_id ? (
                      <Link href={`/contacts/${r.contact_id}`} className="truncate text-sm font-medium hover:text-brand-700">
                        {r.contact_name || "Contact"}
                      </Link>
                    ) : (
                      <span className="text-sm text-zinc-500">No contact</span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      {timeAgo(r.created_at)} <RunStatus status={r.status} />
                    </div>
                  </div>
                  {r.log.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
                      {r.log.map((l, j) => (
                        <li key={j} className={cx(!l.ok && "text-red-600")}>
                          {l.ok ? "✓" : "✕"} {l.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-8 border-t border-zinc-200 pt-4">
            <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
              Delete automation
            </Button>
          </div>
        </section>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a step" wide>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(STEPS) as StepType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setSteps([...steps, defaultStep(t, options)]);
                setAdding(false);
              }}
              className="rounded-lg p-3 text-left ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-brand-300"
            >
              <div className="text-sm font-medium">{STEPS[t].label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{STEPS[t].help}</div>
            </button>
          ))}
        </div>
      </Modal>
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete automation?">
        <p className="text-sm text-zinc-600">This deletes the automation and cancels any runs still waiting. Contacts and their history stay.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmDel(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Connector() {
  return <div className="mx-auto h-5 w-px bg-zinc-300" aria-hidden="true" />;
}

function PipelineStageSelect({
  options,
  pipelineId,
  stageId,
  anyStage,
  onChange,
}: {
  options: Options;
  pipelineId: string;
  stageId?: string;
  anyStage?: string;
  onChange: (pipelineId: string, stageId: string | undefined) => void;
}) {
  const p = options.pipelines.find((x) => x.id === pipelineId);
  if (!options.pipelines.length)
    return (
      <p className="text-sm text-zinc-500">
        <Link href="/pipelines" className="text-brand-600 hover:underline">
          Create a pipeline
        </Link>{" "}
        first.
      </p>
    );
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Pipeline">
        <Select aria-label="Pipeline" value={pipelineId} onChange={(e) => onChange(e.target.value, anyStage ? undefined : options.pipelines.find((x) => x.id === e.target.value)?.stages[0]?.id)}>
          {options.pipelines.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Stage">
        <Select aria-label="Stage" value={stageId ?? ""} onChange={(e) => onChange(pipelineId, e.target.value || undefined)}>
          {anyStage && <option value="">{anyStage}</option>}
          {p?.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function TagInput({ value, onChange, tags, label = "Tag" }: { value: string; onChange: (v: string) => void; tags: string[]; label?: string }) {
  return (
    <Field label={label}>
      <Input aria-label={label} list="automation-tags" value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. lead" />
      <datalist id="automation-tags">
        {tags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Field>
  );
}

function TriggerEditor({ trigger: t, onChange, options, hookUrl }: { trigger: Trigger; onChange: (t: Trigger) => void; options: Options; hookUrl: string | null }) {
  return (
    <div className="space-y-3">
      <Select aria-label="Trigger" value={t.type} onChange={(e) => onChange(defaultTrigger(e.target.value as TriggerType, options))}>
        {(Object.keys(TRIGGERS) as TriggerType[]).map((k) => (
          <option key={k} value={k}>
            {TRIGGERS[k].label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-zinc-500">{TRIGGERS[t.type].help}</p>
      {t.type === "tag_added" && <TagInput value={t.tag} onChange={(tag) => onChange({ ...t, tag })} tags={options.tags} />}
      {t.type === "form_submitted" && (
        <Field label="Site">
          <Select aria-label="Site" value={t.siteId ?? ""} onChange={(e) => onChange({ ...t, siteId: e.target.value || undefined })}>
            <option value="">Any site or funnel</option>
            {options.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {t.type === "opportunity_stage_changed" && (
        <PipelineStageSelect options={options} pipelineId={t.pipelineId} stageId={t.stageId} anyStage="Any stage" onChange={(pipelineId, stageId) => onChange({ ...t, pipelineId, stageId })} />
      )}
      {t.type === "opportunity_status_changed" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pipeline">
            <Select aria-label="Pipeline" value={t.pipelineId ?? ""} onChange={(e) => onChange({ ...t, pipelineId: e.target.value || undefined })}>
              <option value="">Any pipeline</option>
              {options.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select aria-label="Status" value={t.status} onChange={(e) => onChange({ ...t, status: e.target.value as "won" | "lost" })}>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </Select>
          </Field>
        </div>
      )}
      {t.type === "payment_received" && (
        <Field label="Product">
          <Select aria-label="Product" value={t.productId ?? ""} onChange={(e) => onChange({ ...t, productId: e.target.value || undefined })}>
            <option value="">Any product</option>
            {options.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {t.type === "webhook" &&
        (hookUrl ? (
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium text-zinc-700">Webhook URL</div>
            <code className="block rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs break-all text-zinc-700 ring-1 ring-zinc-200">{hookUrl}</code>
            <p className="text-xs text-zinc-500">
              POST JSON with fields like <code>email</code>, <code>first_name</code>, <code>phone</code>, <code>tags</code>. The contact is created or updated, then the steps run. Keep this URL
              private — it contains a secret key.
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Save the automation to get its webhook URL.</p>
        ))}
    </div>
  );
}

function StepEditor({ step: s, onChange, options }: { step: Step; onChange: (s: Step) => void; options: Options }) {
  switch (s.type) {
    case "send_email":
      return (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={s.ai} onChange={(ai) => onChange({ ...s, ai })} label="Let AI write this email" />
            Let AI write a personal email for each contact
          </label>
          {s.ai ? (
            <Field label="What should the email say?" hint="AI uses the contact's details, tags and recent activity. Subject below is optional.">
              <Textarea aria-label="AI instructions" rows={3} value={s.aiInstructions} onChange={(e) => onChange({ ...s, aiInstructions: e.target.value })} placeholder="Thank them for reaching out, mention what they asked about, and invite them to book a call." />
            </Field>
          ) : null}
          <Field label="Subject">
            <Input aria-label="Subject" value={s.subject} onChange={(e) => onChange({ ...s, subject: e.target.value })} placeholder={s.ai ? "(AI writes one if empty)" : "Thanks for reaching out, {{contact.first_name}}"} />
          </Field>
          <EmailComposer
            body={s.body}
            onBodyChange={(body) => onChange({ ...s, body })}
            attachments={s.attachments ?? []}
            onAttachmentsChange={(attachments) => onChange({ ...s, attachments })}
            attachmentsOnly={s.ai}
            placeholder={"Hi {{contact.first_name}},\n\n…"}
          />
          {s.ai && <p className="text-xs text-zinc-500">Tip: put any links you want in the instructions (e.g. your booking page) — AI adds them as links or a button.</p>}
        </div>
      );
    case "notify_team":
      return (
        <div className="space-y-3">
          <Field label="Send to" hint="Leave empty to use the business email from Settings">
            <Input aria-label="Send to" value={s.to} onChange={(e) => onChange({ ...s, to: e.target.value })} placeholder="team@yourbusiness.com" />
          </Field>
          <Field label="Subject">
            <Input aria-label="Subject" value={s.subject} onChange={(e) => onChange({ ...s, subject: e.target.value })} />
          </Field>
          <Field label="Message">
            <Textarea aria-label="Message" rows={4} value={s.body} onChange={(e) => onChange({ ...s, body: e.target.value })} />
          </Field>
        </div>
      );
    case "add_tag":
    case "remove_tag":
      return <TagInput value={s.tag} onChange={(tag) => onChange({ ...s, tag })} tags={options.tags} />;
    case "create_opportunity":
      return (
        <div className="space-y-3">
          <PipelineStageSelect options={options} pipelineId={s.pipelineId} stageId={s.stageId} onChange={(pipelineId, stageId) => onChange({ ...s, pipelineId, stageId })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Deal name">
              <Input aria-label="Deal name" value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} />
            </Field>
            <Field label="Value">
              <Input
                aria-label="Value"
                inputMode="decimal"
                value={String(s.valueCents / 100)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) onChange({ ...s, valueCents: Math.round(n * 100) });
                }}
              />
            </Field>
          </div>
        </div>
      );
    case "move_opportunity":
      return <PipelineStageSelect options={options} pipelineId={s.pipelineId} stageId={s.stageId} onChange={(pipelineId, stageId) => onChange({ ...s, pipelineId, stageId: stageId ?? "" })} />;
    case "create_task":
      return (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Field label="Task">
            <Input aria-label="Task" value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} />
          </Field>
          <Field label="Due in (days)">
            <Input aria-label="Due in days" type="number" min={0} max={365} value={s.dueInDays} onChange={(e) => onChange({ ...s, dueInDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />
          </Field>
        </div>
      );
    case "wait":
      return (
        <div className="flex gap-2">
          <Input aria-label="Wait amount" type="number" min={1} value={s.amount} onChange={(e) => onChange({ ...s, amount: Math.max(1, Number(e.target.value) || 1) })} className="w-24" />
          <Select aria-label="Wait unit" value={s.unit} onChange={(e) => onChange({ ...s, unit: e.target.value as typeof s.unit })} className="w-32">
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </Select>
        </div>
      );
    case "if_tag":
      return (
        <div className="grid grid-cols-[140px_1fr] items-end gap-2">
          <Field label="Contact">
            <Select aria-label="Condition" value={s.has ? "has" : "not"} onChange={(e) => onChange({ ...s, has: e.target.value === "has" })}>
              <option value="has">has tag</option>
              <option value="not">doesn&apos;t have tag</option>
            </Select>
          </Field>
          <TagInput value={s.tag} onChange={(tag) => onChange({ ...s, tag })} tags={options.tags} />
        </div>
      );
    case "webhook":
      return (
        <Field label="URL" hint="We POST the contact and event as JSON">
          <Input aria-label="Webhook URL" type="url" value={s.url} onChange={(e) => onChange({ ...s, url: e.target.value })} placeholder="https://hooks.zapier.com/…" />
        </Field>
      );
  }
}
