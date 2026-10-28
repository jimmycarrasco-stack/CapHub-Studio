import "server-only";
import { nanoid } from "nanoid";
import { db } from "../db";
import { HttpError } from "../errors";
import { slugify } from "../site-builder";

/**
 * A funnel is an ordered list of Site Builder pages served under /f/<slug>/<step>.
 * Forms on a step capture the lead and send the visitor to the next step; checkout
 * buttons take payment and then continue to the next step.
 */

export interface FunnelStep {
  site_id: string;
  position: number;
  name: string;
  has_html: boolean;
}

export interface Funnel {
  id: string;
  location_id: string;
  name: string;
  slug: string;
  steps: FunnelStep[];
  created_at: string;
}

function stepsOf(funnelId: string): FunnelStep[] {
  return (
    db()
      .prepare(
        `SELECT fs.site_id, fs.position, s.name, LENGTH(s.html) > 0 AS has_html FROM funnel_steps fs JOIN sites s ON s.id = fs.site_id
         WHERE fs.funnel_id = ? ORDER BY fs.position`,
      )
      .all(funnelId) as (Omit<FunnelStep, "has_html"> & { has_html: number })[]
  ).map((s) => ({ ...s, has_html: !!s.has_html }));
}

export function listFunnels(locationId: string): Funnel[] {
  return (db().prepare("SELECT * FROM funnels WHERE location_id = ? ORDER BY created_at DESC").all(locationId) as Omit<Funnel, "steps">[]).map((f) => ({
    ...f,
    steps: stepsOf(f.id),
  }));
}

export function getFunnel(id: string): Funnel | null {
  const f = db().prepare("SELECT * FROM funnels WHERE id = ?").get(id) as Omit<Funnel, "steps"> | undefined;
  return f ? { ...f, steps: stepsOf(f.id) } : null;
}

export function getFunnelBySlug(slug: string): Funnel | null {
  const f = db().prepare("SELECT * FROM funnels WHERE slug = ?").get(slug) as Omit<Funnel, "steps"> | undefined;
  return f ? { ...f, steps: stepsOf(f.id) } : null;
}

function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const hit = db().prepare("SELECT id FROM funnels WHERE slug = ?").get(slug) as { id: string } | undefined;
    if (!hit || hit.id === excludeId) return slug;
  }
}

function checkSites(locationId: string, siteIds: string[]) {
  if (new Set(siteIds).size !== siteIds.length) throw new HttpError(400, "A page can only appear once in a funnel");
  for (const id of siteIds) {
    const s = db().prepare("SELECT location_id FROM sites WHERE id = ?").get(id) as { location_id: string } | undefined;
    if (!s || s.location_id !== locationId) throw new HttpError(400, "A funnel step refers to a page that doesn't exist");
  }
}

export function createFunnel(locationId: string, name: string, siteIds: string[] = []) {
  checkSites(locationId, siteIds);
  const id = nanoid(10);
  db().transaction(() => {
    db().prepare("INSERT INTO funnels (id, location_id, name, slug) VALUES (?, ?, ?, ?)").run(id, locationId, name.trim().slice(0, 100), uniqueSlug(name));
    siteIds.forEach((s, i) => db().prepare("INSERT INTO funnel_steps (funnel_id, site_id, position) VALUES (?, ?, ?)").run(id, s, i));
  })();
  return getFunnel(id)!;
}

export function updateFunnel(id: string, input: { name?: string; slug?: string; siteIds?: string[] }) {
  const f = getFunnel(id);
  if (!f) throw new HttpError(404, "Funnel not found");
  if (input.siteIds) checkSites(f.location_id, input.siteIds);
  db().transaction(() => {
    if (input.name !== undefined) db().prepare("UPDATE funnels SET name = ? WHERE id = ?").run(input.name.trim().slice(0, 100), id);
    if (input.slug !== undefined) db().prepare("UPDATE funnels SET slug = ? WHERE id = ?").run(uniqueSlug(input.slug, id), id);
    if (input.siteIds) {
      db().prepare("DELETE FROM funnel_steps WHERE funnel_id = ?").run(id);
      input.siteIds.forEach((s, i) => db().prepare("INSERT INTO funnel_steps (funnel_id, site_id, position) VALUES (?, ?, ?)").run(id, s, i));
    }
  })();
  return getFunnel(id)!;
}

export function deleteFunnel(id: string) {
  db().prepare("DELETE FROM funnels WHERE id = ?").run(id);
}
