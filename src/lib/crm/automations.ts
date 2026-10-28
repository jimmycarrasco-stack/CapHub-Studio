import "server-only";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { getLocation } from "../auth";
import { db } from "../db";
import { HttpError } from "../errors";
import { getProvider } from "../llm";
import { addActivity, addTag, contactName, getContact, removeTag, createTask } from "./contacts";
import { automationInputSchema, describeStep, waitMs, type AutomationInput, type Step, type Trigger } from "./automation-defs";
import { mergeVars, renderTemplate, sendEmail } from "./email";
import { emitEvent, onEvent, type CrmEvent, type EventMeta } from "./events";
import { createOpportunity, getPipeline, listContactOpportunities, updateOpportunity } from "./pipelines";

export interface Automation {
  id: string;
  location_id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  steps: Step[];
  hook_secret: string;
  created_at: string;
  updated_at: string;
}

export interface RunLogEntry {
  at: string;
  step: number;
  ok: boolean;
  message: string;
}

export interface Run {
  id: number;
  automation_id: string;
  automation_name?: string;
  contact_id: string | null;
  contact_name: string | null;
  status: "active" | "running" | "done" | "failed" | "cancelled";
  step_index: number;
  next_run_at: string;
  log: RunLogEntry[];
  created_at: string;
  updated_at: string;
}

type Row = Record<string, unknown>;
const MAX_DEPTH = 3; // automations triggering automations — stop runaway loops

const toAutomation = (r: Row): Automation => ({
  ...(r as unknown as Automation),
  enabled: !!r.enabled,
  trigger: JSON.parse(r.trigger as string),
  steps: JSON.parse(r.steps as string),
});

const sqlNow = (ms = Date.now()) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

// ───────── CRUD ─────────

export function listAutomations(locationId: string) {
  return (
    db()
      .prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id) AS run_count,
           (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id AND r.status IN ('active','running')) AS active_count
         FROM automations a WHERE a.location_id = ? ORDER BY a.updated_at DESC`,
      )
      .all(locationId) as Row[]
  ).map((r) => ({
    ...toAutomation(r),
    run_count: r.run_count as number,
    active_count: r.active_count as number,
  }));
}

export function getAutomation(id: string): Automation | null {
  const r = db().prepare("SELECT * FROM automations WHERE id = ?").get(id) as Row | undefined;
  return r ? toAutomation(r) : null;
}

/** Checks that pipelines/stages referenced by the automation belong to this sub-account. */
function checkRefs(locationId: string, input: AutomationInput) {
  const checkPipeline = (pipelineId: string, stageId?: string) => {
    const p = getPipeline(pipelineId);
    if (!p || p.location_id !== locationId) throw new HttpError(400, "An automation step refers to a pipeline that doesn't exist");
    if (stageId && !p.stages.some((s) => s.id === stageId)) throw new HttpError(400, "An automation step refers to a stage that doesn't exist");
  };
  const t = input.trigger;
  if (t.type === "opportunity_stage_changed") checkPipeline(t.pipelineId, t.stageId);
  if (t.type === "opportunity_status_changed" && t.pipelineId) checkPipeline(t.pipelineId);
  for (const s of input.steps) if (s.type === "create_opportunity" || s.type === "move_opportunity") checkPipeline(s.pipelineId, s.stageId);
}

export function createAutomation(locationId: string, raw: unknown) {
  const input = automationInputSchema.parse(raw);
  checkRefs(locationId, input);
  const id = nanoid(12);
  db()
    .prepare("INSERT INTO automations (id, location_id, name, enabled, trigger, steps, hook_secret) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, locationId, input.name, input.enabled ? 1 : 0, JSON.stringify(input.trigger), JSON.stringify(input.steps), randomBytes(18).toString("base64url"));
  return getAutomation(id)!;
}

export function updateAutomation(id: string, raw: unknown) {
  const a = getAutomation(id);
  if (!a) throw new HttpError(404, "Automation not found");
  const input = automationInputSchema.parse(raw);
  checkRefs(a.location_id, input);
  db()
    .prepare("UPDATE automations SET name = ?, enabled = ?, trigger = ?, steps = ?, updated_at = datetime('now') WHERE id = ?")
    .run(input.name, (input.enabled ?? a.enabled) ? 1 : 0, JSON.stringify(input.trigger), JSON.stringify(input.steps), id);
  return getAutomation(id)!;
}

export function setAutomationEnabled(id: string, enabled: boolean) {
  db()
    .prepare("UPDATE automations SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
    .run(enabled ? 1 : 0, id);
}

export function deleteAutomation(id: string) {
  db().prepare("DELETE FROM automations WHERE id = ?").run(id);
}

export function listRuns(opts: { automationId?: string; contactId?: string; locationId?: string; limit?: number }): Run[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.automationId) {
    where.push("r.automation_id = ?");
    args.push(opts.automationId);
  }
  if (opts.contactId) {
    where.push("r.contact_id = ?");
    args.push(opts.contactId);
  }
  if (opts.locationId) {
    where.push("r.location_id = ?");
    args.push(opts.locationId);
  }
  return (
    db()
      .prepare(
        `SELECT r.*, a.name AS automation_name, TRIM(c.first_name || ' ' || c.last_name) AS contact_name
         FROM automation_runs r JOIN automations a ON a.id = r.automation_id LEFT JOIN contacts c ON c.id = r.contact_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.id DESC LIMIT ?`,
      )
      .all(...args, opts.limit ?? 100) as Row[]
  ).map((r) => ({
    ...(r as unknown as Run),
    log: JSON.parse(r.log as string),
  }));
}

export function cancelRun(runId: number) {
  db().prepare("UPDATE automation_runs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'active'").run(runId);
}

// ───────── enrollment ─────────

function triggerMatches(t: Trigger, e: CrmEvent): boolean {
  if (t.type !== e.type) return false;
  switch (t.type) {
    case "tag_added":
      return e.type === "tag_added" && e.data.tag.toLowerCase() === t.tag.toLowerCase();
    case "form_submitted":
      return e.type === "form_submitted" && (!t.siteId || t.siteId === e.data.siteId);
    case "opportunity_stage_changed":
      return e.type === "opportunity_stage_changed" && t.pipelineId === e.data.pipelineId && (!t.stageId || t.stageId === e.data.stageId);
    case "opportunity_status_changed":
      return e.type === "opportunity_status_changed" && t.status === e.data.status && (!t.pipelineId || t.pipelineId === e.data.pipelineId);
    case "payment_received":
      return e.type === "payment_received" && (!t.productId || t.productId === e.data.productId);
    case "webhook":
    case "manual":
      return (e.type === "webhook" || e.type === "manual") && e.data.automationId !== undefined;
    default:
      return true;
  }
}

/** Starts a run for a contact unless one is already in progress for this automation. */
export function enroll(a: Automation, contactId: string | null, event: CrmEvent, depth = 0): number | null {
  if (contactId) {
    const busy = db().prepare("SELECT 1 FROM automation_runs WHERE automation_id = ? AND contact_id = ? AND status IN ('active','running')").get(a.id, contactId);
    if (busy) return null;
  }
  const r = db()
    .prepare("INSERT INTO automation_runs (automation_id, location_id, contact_id, status, next_run_at, context) VALUES (?, ?, ?, 'active', ?, ?)")
    .run(a.id, a.location_id, contactId, sqlNow(), JSON.stringify({ event, depth }));
  if (contactId) addActivity(a.location_id, contactId, "automation", `Entered automation: ${a.name}`, { automationId: a.id });
  kick();
  return Number(r.lastInsertRowid);
}

function handleEvent(locationId: string, e: CrmEvent, meta: EventMeta) {
  const depth = meta.depth ?? 0;
  if (depth > MAX_DEPTH) return;
  const rows = db().prepare("SELECT * FROM automations WHERE location_id = ? AND enabled = 1").all(locationId) as Row[];
  for (const a of rows.map(toAutomation)) {
    if (!triggerMatches(a.trigger, e)) continue;
    if ((e.type === "webhook" || e.type === "manual") && e.data.automationId !== a.id) continue;
    enroll(a, e.contactId, e, depth);
  }
}

onEvent(handleEvent);

/** Manual enrollment from the contact page (works whatever the trigger, if the automation is on). */
export function enrollManually(a: Automation, contactId: string) {
  if (!a.enabled) throw new HttpError(409, "Turn this automation on first");
  const id = enroll(a, contactId, {
    type: "manual",
    contactId,
    data: { automationId: a.id },
  });
  if (!id) throw new HttpError(409, "This contact is already going through this automation");
  return id;
}

// ───────── execution ─────────

type StepResult = {
  ok: boolean;
  message: string;
  waitUntil?: number;
  stop?: boolean;
};

async function aiWriteEmail(locationId: string, contactId: string | null, instructions: string) {
  const provider = getProvider("default");
  const loc = getLocation(locationId);
  const vars = mergeVars(contactId);
  const text = await provider.complete({
    system:
      "You write short, warm, professional emails on behalf of a small business. Reply with the subject on the first line as `Subject: ...`, " +
      "a blank line, then the plain-text body (no markdown, no placeholders, sign off with the business name). Never invent facts, prices or promises not in the instructions.",
    messages: [
      {
        role: "user",
        content: `Business: ${loc?.name ?? ""}${loc?.website ? ` (${loc.website})` : ""}\nRecipient: ${JSON.stringify(vars.contact)}\n\nWhat the email should do:\n${instructions}`,
      },
    ],
    maxTokens: 1500,
  });
  const m = text.match(/^\s*Subject:\s*(.+)\n+([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: "A quick note", body: text.trim() };
}

async function execStep(
  run: {
    location_id: string;
    contact_id: string | null;
    context: { event: CrmEvent; depth: number };
  },
  step: Step,
): Promise<StepResult> {
  const loc = run.location_id;
  const contact = run.contact_id ? getContact(run.contact_id) : null;
  const vars = mergeVars(run.contact_id, {
    event: run.context.event.data ?? {},
    business: { name: getLocation(loc)?.name ?? "" },
  });
  const meta = { depth: run.context.depth + 1 };
  const needContact = () => {
    if (!contact) throw new Error("This step needs a contact, but the run has none");
    return contact;
  };

  switch (step.type) {
    case "send_email": {
      const c = needContact();
      if (!c.email) return { ok: false, message: "Contact has no email address — skipped" };
      const { subject, body } = step.ai
        ? await aiWriteEmail(loc, c.id, renderTemplate(step.aiInstructions || step.body, vars))
        : {
            subject: renderTemplate(step.subject, vars),
            body: renderTemplate(step.body, vars),
          };
      const r = await sendEmail(loc, {
        to: c.email,
        subject,
        body,
        contactId: c.id,
      });
      return {
        ok: r.ok,
        message: r.ok ? `Emailed ${c.email}: ${subject}` : `Email failed: ${r.error}`,
      };
    }
    case "notify_team": {
      const to = step.to.trim() || getLocation(loc)?.email;
      if (!to)
        return {
          ok: false,
          message: "No team email set (Settings → Business profile)",
        };
      const r = await sendEmail(loc, {
        to,
        subject: renderTemplate(step.subject, vars),
        body: renderTemplate(step.body, vars),
        skipDnd: true,
      });
      return {
        ok: r.ok,
        message: r.ok ? `Notified ${to}` : `Notify failed: ${r.error}`,
      };
    }
    case "add_tag": {
      const c = needContact();
      const t = renderTemplate(step.tag, vars);
      // Re-emits tag_added (depth+1) so tag-triggered automations can chain, with loop protection.
      const added = addTag(loc, c.id, t, { silent: true });
      if (added) emitEvent(loc, { type: "tag_added", contactId: c.id, data: { tag: t } }, meta);
      return {
        ok: true,
        message: added ? `Added tag “${t}”` : `Already tagged “${t}”`,
      };
    }
    case "remove_tag": {
      const c = needContact();
      const removed = removeTag(loc, c.id, renderTemplate(step.tag, vars));
      return {
        ok: true,
        message: removed ? `Removed tag “${step.tag}”` : `Didn't have tag “${step.tag}”`,
      };
    }
    case "create_opportunity": {
      const o = createOpportunity(
        loc,
        {
          pipelineId: step.pipelineId,
          stageId: step.stageId,
          title: renderTemplate(step.title, vars) || (contact ? contactName(contact) : "New deal"),
          valueCents: step.valueCents,
          contactId: contact?.id ?? null,
        },
        meta,
      );
      return { ok: true, message: `Created deal “${o.title}”` };
    }
    case "move_opportunity": {
      const c = needContact();
      const open = listContactOpportunities(c.id).find((o) => o.pipeline_id === step.pipelineId && o.status === "open");
      if (open) {
        updateOpportunity(open.id, { stageId: step.stageId }, meta);
        return { ok: true, message: `Moved deal “${open.title}”` };
      }
      const o = createOpportunity(
        loc,
        {
          pipelineId: step.pipelineId,
          stageId: step.stageId,
          title: contactName(c),
          contactId: c.id,
        },
        meta,
      );
      return { ok: true, message: `No open deal — created “${o.title}”` };
    }
    case "create_task": {
      const due = new Date(Date.now() + step.dueInDays * 86_400_000).toISOString().slice(0, 10);
      createTask(loc, {
        title: renderTemplate(step.title, vars),
        contactId: contact?.id ?? null,
        dueAt: due,
      });
      return { ok: true, message: `Created task (due ${due})` };
    }
    case "wait":
      return {
        ok: true,
        message: describeStep(step),
        waitUntil: Date.now() + waitMs(step),
      };
    case "if_tag": {
      const c = needContact();
      const has = c.tags.some((t) => t.toLowerCase() === step.tag.toLowerCase());
      const pass = has === step.has;
      return {
        ok: true,
        message: pass ? `Condition met (${step.has ? "has" : "doesn't have"} “${step.tag}”)` : "Condition not met — stopped",
        stop: !pass,
      };
    }
    case "webhook": {
      const res = await fetch(step.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CapHub-Automations",
        },
        body: JSON.stringify({
          contact,
          event: run.context.event,
          business: getLocation(loc)?.name,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return { ok: res.ok, message: `Webhook responded ${res.status}` };
    }
  }
}

/** Runs one run until it finishes, waits, or fails. */
async function advance(runId: number) {
  // Claim it (prevents two workers processing the same run).
  const claimed = db().prepare("UPDATE automation_runs SET status = 'running', updated_at = datetime('now') WHERE id = ? AND status = 'active'").run(runId);
  if (!claimed.changes) return;
  const r = db().prepare("SELECT * FROM automation_runs WHERE id = ?").get(runId) as Row;
  const a = getAutomation(r.automation_id as string);
  const log: RunLogEntry[] = JSON.parse(r.log as string);
  const ctx = JSON.parse(r.context as string) as {
    event: CrmEvent;
    depth: number;
  };
  let i = r.step_index as number;
  const save = (status: string, nextRunAt?: string) =>
    db()
      .prepare("UPDATE automation_runs SET status = ?, step_index = ?, log = ?, next_run_at = COALESCE(?, next_run_at), updated_at = datetime('now') WHERE id = ?")
      .run(status, i, JSON.stringify(log.slice(-200)), nextRunAt ?? null, runId);

  if (!a || !a.enabled) {
    log.push({
      at: sqlNow(),
      step: i,
      ok: false,
      message: a ? "Automation was turned off — stopped" : "Automation was deleted",
    });
    return save("cancelled");
  }
  if (r.contact_id && !getContact(r.contact_id as string)) {
    log.push({
      at: sqlNow(),
      step: i,
      ok: false,
      message: "Contact was deleted",
    });
    return save("cancelled");
  }

  while (i < a.steps.length) {
    const step = a.steps[i];
    let res: StepResult;
    try {
      res = await execStep(
        {
          location_id: r.location_id as string,
          contact_id: r.contact_id as string | null,
          context: ctx,
        },
        step,
      );
    } catch (err) {
      res = {
        ok: false,
        message: `${describeStep(step)} failed: ${(err as Error).message}`,
      };
    }
    log.push({ at: sqlNow(), step: i, ok: res.ok, message: res.message });
    i++;
    if (res.stop) return save("done");
    if (res.waitUntil) return save("active", sqlNow(res.waitUntil));
    // A failed email/webhook doesn't stop the run; other failures do.
    if (!res.ok && !["send_email", "notify_team", "webhook"].includes(step.type)) return save("failed");
  }
  if (r.contact_id) addActivity(r.location_id as string, r.contact_id as string, "automation", `Finished automation: ${a.name}`, { automationId: a.id });
  save("done");
}

let busy = false;
let again = false;

/** Processes every run that's due. Safe to call often. */
export async function processDueRuns() {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    do {
      again = false;
      const due = db().prepare("SELECT id FROM automation_runs WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at LIMIT 50").all(sqlNow()) as { id: number }[];
      for (const { id } of due) await advance(id);
      if (due.length === 50) again = true;
    } while (again);
  } finally {
    busy = false;
  }
}

/** Runs left in "running" by a crash/restart go back to the queue. */
export function recoverStuckRuns() {
  db().prepare("UPDATE automation_runs SET status = 'active' WHERE status = 'running'").run();
}

function kick() {
  setTimeout(() => void processDueRuns().catch((e) => console.error("[caphub] automations", e)), 10);
}
