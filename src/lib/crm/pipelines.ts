import "server-only";
import { nanoid } from "nanoid";
import { db } from "../db";
import { HttpError } from "../errors";
import { addActivity } from "./contacts";
import { emitEvent, type EventMeta } from "./events";

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
}

export interface Pipeline {
  id: string;
  location_id: string;
  name: string;
  stages: Stage[];
  created_at: string;
}

export interface Opportunity {
  id: string;
  location_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  title: string;
  value_cents: number;
  status: "open" | "won" | "lost";
  position: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_STAGES = ["New lead", "Contacted", "Proposal sent", "Negotiation", "Closed"];

function stagesOf(pipelineId: string): Stage[] {
  return db().prepare("SELECT * FROM stages WHERE pipeline_id = ? ORDER BY position").all(pipelineId) as Stage[];
}

export function listPipelines(locationId: string): Pipeline[] {
  return (db().prepare("SELECT * FROM pipelines WHERE location_id = ? ORDER BY created_at").all(locationId) as Omit<Pipeline, "stages">[]).map((p) => ({
    ...p,
    stages: stagesOf(p.id),
  }));
}

export function getPipeline(id: string): Pipeline | null {
  const p = db().prepare("SELECT * FROM pipelines WHERE id = ?").get(id) as Omit<Pipeline, "stages"> | undefined;
  return p ? { ...p, stages: stagesOf(p.id) } : null;
}

export function createPipeline(locationId: string, name: string, stageNames: string[] = DEFAULT_STAGES): Pipeline {
  const id = nanoid(10);
  db().transaction(() => {
    db().prepare("INSERT INTO pipelines (id, location_id, name) VALUES (?, ?, ?)").run(id, locationId, name.trim().slice(0, 100));
    stageNames
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s, i) => db().prepare("INSERT INTO stages (id, pipeline_id, name, position) VALUES (?, ?, ?, ?)").run(nanoid(10), id, s.slice(0, 60), i));
  })();
  return getPipeline(id)!;
}

/**
 * Renames the pipeline and replaces its stage list. Stages are matched by id (kept), new entries
 * (no id) are created, and removed stages must be empty.
 */
export function updatePipeline(id: string, input: { name?: string; stages?: { id?: string; name: string }[] }) {
  const p = getPipeline(id);
  if (!p) throw new HttpError(404, "Pipeline not found");
  db().transaction(() => {
    if (input.name !== undefined) db().prepare("UPDATE pipelines SET name = ? WHERE id = ?").run(input.name.trim().slice(0, 100), id);
    if (input.stages) {
      if (!input.stages.length) throw new HttpError(400, "A pipeline needs at least one stage");
      const keep = new Set(input.stages.map((s) => s.id).filter(Boolean));
      for (const s of p.stages) {
        if (keep.has(s.id)) continue;
        const n = (db().prepare("SELECT COUNT(*) AS n FROM opportunities WHERE stage_id = ?").get(s.id) as { n: number }).n;
        if (n) throw new HttpError(409, `Move the ${n} deal(s) out of “${s.name}” before deleting that stage`);
        db().prepare("DELETE FROM stages WHERE id = ?").run(s.id);
      }
      input.stages.forEach((s, i) => {
        if (s.id && p.stages.some((x) => x.id === s.id)) db().prepare("UPDATE stages SET name = ?, position = ? WHERE id = ?").run(s.name.trim().slice(0, 60), i, s.id);
        else db().prepare("INSERT INTO stages (id, pipeline_id, name, position) VALUES (?, ?, ?, ?)").run(nanoid(10), id, s.name.trim().slice(0, 60), i);
      });
    }
  })();
  return getPipeline(id)!;
}

export function deletePipeline(id: string) {
  db().prepare("DELETE FROM pipelines WHERE id = ?").run(id);
}

const OPP_SELECT = `SELECT o.*, TRIM(c.first_name || ' ' || c.last_name) AS contact_name, c.email AS contact_email
  FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id`;

export function listOpportunities(pipelineId: string, opts: { status?: string } = {}): Opportunity[] {
  const where = ["o.pipeline_id = ?"];
  const args: unknown[] = [pipelineId];
  if (opts.status) {
    where.push("o.status = ?");
    args.push(opts.status);
  }
  return db()
    .prepare(`${OPP_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.position, o.created_at`)
    .all(...args) as Opportunity[];
}

export function listContactOpportunities(contactId: string) {
  return db()
    .prepare(
      `${OPP_SELECT.replace("SELECT o.*", "SELECT o.*, p.name AS pipeline_name, s.name AS stage_name")} JOIN pipelines p ON p.id = o.pipeline_id JOIN stages s ON s.id = o.stage_id WHERE o.contact_id = ? ORDER BY o.updated_at DESC`,
    )
    .all(contactId) as (Opportunity & {
    pipeline_name: string;
    stage_name: string;
  })[];
}

export function getOpportunity(id: string): Opportunity | null {
  return (db().prepare(`${OPP_SELECT} WHERE o.id = ?`).get(id) as Opportunity | undefined) ?? null;
}

function stageInPipeline(pipelineId: string, stageId: string) {
  const s = db().prepare("SELECT * FROM stages WHERE id = ? AND pipeline_id = ?").get(stageId, pipelineId) as Stage | undefined;
  if (!s) throw new HttpError(400, "That stage isn't in this pipeline");
  return s;
}

export function createOpportunity(
  locationId: string,
  input: {
    pipelineId: string;
    stageId?: string;
    title: string;
    valueCents?: number;
    contactId?: string | null;
  },
  meta: EventMeta & { userId?: string } = {},
): Opportunity {
  const p = getPipeline(input.pipelineId);
  if (!p || p.location_id !== locationId) throw new HttpError(404, "Pipeline not found");
  const stage = input.stageId ? stageInPipeline(p.id, input.stageId) : p.stages[0];
  if (!stage) throw new HttpError(400, "This pipeline has no stages");
  const id = nanoid(12);
  const pos = (db().prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM opportunities WHERE stage_id = ?").get(stage.id) as { p: number }).p;
  db()
    .prepare("INSERT INTO opportunities (id, location_id, pipeline_id, stage_id, contact_id, title, value_cents, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, locationId, p.id, stage.id, input.contactId ?? null, input.title.trim().slice(0, 200), Math.max(0, Math.round(input.valueCents ?? 0)), pos);
  if (input.contactId) addActivity(locationId, input.contactId, "opportunity", `Added to ${p.name} → ${stage.name}: ${input.title}`, { opportunityId: id }, meta.userId);
  emitEvent(
    locationId,
    {
      type: "opportunity_stage_changed",
      contactId: input.contactId ?? null,
      data: { opportunityId: id, pipelineId: p.id, stageId: stage.id },
    },
    meta,
  );
  return getOpportunity(id)!;
}

export function updateOpportunity(
  id: string,
  patch: {
    stageId?: string;
    position?: number;
    title?: string;
    valueCents?: number;
    status?: "open" | "won" | "lost";
    contactId?: string | null;
  },
  meta: EventMeta & { userId?: string } = {},
): Opportunity {
  const o = getOpportunity(id);
  if (!o) throw new HttpError(404, "Opportunity not found");
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  let stageChanged: Stage | null = null;
  if (patch.stageId && patch.stageId !== o.stage_id) {
    stageChanged = stageInPipeline(o.pipeline_id, patch.stageId);
    set("stage_id", patch.stageId);
  }
  if (patch.position !== undefined) set("position", patch.position);
  if (patch.title !== undefined) set("title", patch.title.trim().slice(0, 200));
  if (patch.valueCents !== undefined) set("value_cents", Math.max(0, Math.round(patch.valueCents)));
  if (patch.contactId !== undefined) set("contact_id", patch.contactId);
  const statusChanged = patch.status && patch.status !== o.status ? patch.status : null;
  if (statusChanged) set("status", statusChanged);
  if (!sets.length) return o;
  sets.push("updated_at = datetime('now')");
  db()
    .prepare(`UPDATE opportunities SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals, id);
  const contactId = patch.contactId !== undefined ? patch.contactId : o.contact_id;
  if (stageChanged) {
    if (contactId) addActivity(o.location_id, contactId, "opportunity", `${o.title} moved to ${stageChanged.name}`, { opportunityId: id }, meta.userId);
    emitEvent(
      o.location_id,
      {
        type: "opportunity_stage_changed",
        contactId,
        data: {
          opportunityId: id,
          pipelineId: o.pipeline_id,
          stageId: stageChanged.id,
        },
      },
      meta,
    );
  }
  if (statusChanged) {
    if (contactId) addActivity(o.location_id, contactId, "opportunity", `${o.title} marked ${statusChanged}`, { opportunityId: id }, meta.userId);
    emitEvent(
      o.location_id,
      {
        type: "opportunity_status_changed",
        contactId,
        data: {
          opportunityId: id,
          pipelineId: o.pipeline_id,
          status: statusChanged,
        },
      },
      meta,
    );
  }
  return getOpportunity(id)!;
}

export function deleteOpportunity(id: string) {
  db().prepare("DELETE FROM opportunities WHERE id = ?").run(id);
}

export function pipelineStats(locationId: string) {
  return db()
    .prepare(
      `SELECT COUNT(*) FILTER (WHERE status = 'open') AS open_count,
              COALESCE(SUM(value_cents) FILTER (WHERE status = 'open'), 0) AS open_value,
              COUNT(*) FILTER (WHERE status = 'won' AND updated_at >= datetime('now', '-30 days')) AS won_30d,
              COALESCE(SUM(value_cents) FILTER (WHERE status = 'won' AND updated_at >= datetime('now', '-30 days')), 0) AS won_value_30d
       FROM opportunities WHERE location_id = ?`,
    )
    .get(locationId) as {
    open_count: number;
    open_value: number;
    won_30d: number;
    won_value_30d: number;
  };
}
