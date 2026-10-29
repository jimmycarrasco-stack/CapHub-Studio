import "server-only";
import { nanoid } from "nanoid";
import { db } from "../db";
import { HttpError } from "../errors";
import { emitEvent } from "./events";
// Registers the automation engine's event listener wherever CRM events can be emitted
// (contacts are imported by every module that emits events). Safe import cycle: only used in functions.
import "./automations";

export interface Contact {
  id: string;
  location_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string;
  source: string;
  custom: Record<string, string>;
  dnd: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string;
  source?: string;
  custom?: Record<string, string>;
  dnd?: boolean;
  tags?: string[];
}

type Row = Record<string, unknown>;

export function contactName(c: Pick<Contact, "first_name" | "last_name" | "email" | "phone">) {
  return `${c.first_name} ${c.last_name}`.trim() || c.email || c.phone || "Unnamed contact";
}

function tagsFor(ids: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  if (!ids.length) return m;
  const rows = db()
    .prepare(`SELECT contact_id, tag FROM contact_tags WHERE contact_id IN (${ids.map(() => "?").join(",")}) ORDER BY tag`)
    .all(...ids) as { contact_id: string; tag: string }[];
  for (const r of rows) m.set(r.contact_id, [...(m.get(r.contact_id) ?? []), r.tag]);
  return m;
}

function hydrate(rows: Row[]): Contact[] {
  const tags = tagsFor(rows.map((r) => r.id as string));
  return rows.map((r) => ({
    ...(r as unknown as Contact),
    custom: JSON.parse((r.custom as string) || "{}"),
    dnd: !!r.dnd,
    tags: tags.get(r.id as string) ?? [],
  }));
}

const clean = (s: string | null | undefined) => {
  const v = (s ?? "").trim();
  return v ? v : null;
};

export function normalizeEmail(e: string | null | undefined) {
  return clean(e)?.toLowerCase() ?? null;
}

export interface ContactFilter {
  q?: string;
  tag?: string;
}

function contactWhere(locationId: string, opts: ContactFilter) {
  const where = ["c.location_id = ?"];
  const args: unknown[] = [locationId];
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.push("(c.first_name || ' ' || c.last_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\')");
    args.push(like, like, like, like);
  }
  if (opts.tag) {
    where.push("EXISTS (SELECT 1 FROM contact_tags t WHERE t.contact_id = c.id AND t.tag = ?)");
    args.push(opts.tag);
  }
  return { where, args };
}

export function listContacts(locationId: string, opts: ContactFilter & { limit?: number; offset?: number } = {}) {
  const { where, args } = contactWhere(locationId, opts);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const total = (
    db()
      .prepare(`SELECT COUNT(*) AS n FROM contacts c WHERE ${where.join(" AND ")}`)
      .get(...args) as { n: number }
  ).n;
  const rows = db()
    .prepare(`SELECT c.* FROM contacts c WHERE ${where.join(" AND ")} ORDER BY c.updated_at DESC, c.id LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as Row[];
  return { total, contacts: hydrate(rows) };
}

export function getContact(id: string): Contact | null {
  const r = db().prepare("SELECT * FROM contacts WHERE id = ?").get(id) as Row | undefined;
  return r ? hydrate([r])[0] : null;
}

export function findContactByEmail(locationId: string, email: string) {
  const r = db().prepare("SELECT * FROM contacts WHERE location_id = ? AND email = ?").get(locationId, normalizeEmail(email)) as Row | undefined;
  return r ? hydrate([r])[0] : null;
}

export function listLocationTags(locationId: string) {
  return db().prepare("SELECT tag, COUNT(*) AS count FROM contact_tags WHERE location_id = ? GROUP BY tag ORDER BY tag").all(locationId) as {
    tag: string;
    count: number;
  }[];
}

export function createContact(locationId: string, input: ContactInput, opts: { userId?: string; silent?: boolean } = {}): Contact {
  const email = normalizeEmail(input.email);
  if (!email && !clean(input.phone) && !clean(input.first_name) && !clean(input.last_name)) {
    throw new HttpError(400, "A contact needs at least a name, email or phone");
  }
  if (email && findContactByEmail(locationId, email)) throw new HttpError(409, `A contact with email ${email} already exists`);
  const id = nanoid(12);
  db()
    .prepare(
      `INSERT INTO contacts (id, location_id, first_name, last_name, email, phone, company, source, custom, dnd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      locationId,
      (input.first_name ?? "").trim(),
      (input.last_name ?? "").trim(),
      email,
      clean(input.phone),
      (input.company ?? "").trim(),
      (input.source ?? "manual").trim(),
      JSON.stringify(input.custom ?? {}),
      input.dnd ? 1 : 0,
    );
  addActivity(locationId, id, "created", `Contact created${input.source ? ` (${input.source})` : ""}`, undefined, opts.userId);
  if (!opts.silent) emitEvent(locationId, { type: "contact_created", contactId: id });
  for (const t of input.tags ?? []) addTag(locationId, id, t, opts);
  return getContact(id)!;
}

export function updateContact(id: string, patch: ContactInput, opts: { userId?: string } = {}): Contact {
  const c = getContact(id);
  if (!c) throw new HttpError(404, "Contact not found");
  const email = patch.email === undefined ? undefined : normalizeEmail(patch.email);
  if (email && email !== c.email) {
    const other = findContactByEmail(c.location_id, email);
    if (other && other.id !== id) throw new HttpError(409, `Another contact already uses ${email}`);
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.first_name !== undefined) set("first_name", patch.first_name.trim());
  if (patch.last_name !== undefined) set("last_name", patch.last_name.trim());
  if (email !== undefined) set("email", email);
  if (patch.phone !== undefined) set("phone", clean(patch.phone));
  if (patch.company !== undefined) set("company", patch.company.trim());
  if (patch.source !== undefined) set("source", patch.source.trim());
  if (patch.custom !== undefined) set("custom", JSON.stringify({ ...c.custom, ...patch.custom }));
  if (patch.dnd !== undefined) set("dnd", patch.dnd ? 1 : 0);
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    db()
      .prepare(`UPDATE contacts SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals, id);
  }
  if (patch.tags) {
    const next = new Set(
      patch.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.toLowerCase()),
    );
    for (const t of c.tags) if (!next.has(t.toLowerCase())) removeTag(c.location_id, id, t, opts);
    for (const t of patch.tags) addTag(c.location_id, id, t, opts);
  }
  return getContact(id)!;
}

/**
 * Finds a contact by email (or creates one) and fills in missing fields — used by forms,
 * payments and inbound webhooks. Returns the contact and whether it was created.
 */
export function upsertContact(locationId: string, input: ContactInput & { source: string }): { contact: Contact; created: boolean } {
  const email = normalizeEmail(input.email);
  const existing = email ? findContactByEmail(locationId, email) : null;
  if (!existing) return { contact: createContact(locationId, input), created: true };
  const patch: ContactInput = {};
  if (!existing.first_name && input.first_name) patch.first_name = input.first_name;
  if (!existing.last_name && input.last_name) patch.last_name = input.last_name;
  if (!existing.phone && input.phone) patch.phone = input.phone;
  if (!existing.company && input.company) patch.company = input.company;
  if (input.custom && Object.keys(input.custom).length) patch.custom = input.custom;
  const updated = Object.keys(patch).length ? updateContact(existing.id, patch) : existing;
  for (const t of input.tags ?? []) addTag(locationId, existing.id, t);
  return { contact: getContact(updated.id)!, created: false };
}

export function deleteContact(id: string) {
  db().prepare("DELETE FROM contacts WHERE id = ?").run(id);
}

/** Ids of every contact matching a search/tag filter (for "select all matching"). */
export function matchingContactIds(locationId: string, filter: ContactFilter): string[] {
  const { where, args } = contactWhere(locationId, filter);
  return (db().prepare(`SELECT c.id FROM contacts c WHERE ${where.join(" AND ")}`).all(...args) as { id: string }[]).map((r) => r.id);
}

/** Deletes many contacts at once (only ones in this sub-account). Returns how many were deleted. */
export function bulkDeleteContacts(locationId: string, ids: string[]): number {
  const stmt = db().prepare("DELETE FROM contacts WHERE id = ? AND location_id = ?");
  let n = 0;
  db().transaction(() => {
    for (const id of ids) n += stmt.run(id, locationId).changes;
  })();
  return n;
}

export function touchContact(id: string) {
  db().prepare("UPDATE contacts SET updated_at = datetime('now') WHERE id = ?").run(id);
}

// ───────── tags ─────────

export function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, " ").slice(0, 50);
}

export function addTag(locationId: string, contactId: string, tag: string, opts: { userId?: string; silent?: boolean } = {}) {
  const t = normalizeTag(tag);
  if (!t) return false;
  const r = db().prepare("INSERT OR IGNORE INTO contact_tags (location_id, contact_id, tag) VALUES (?, ?, ?)").run(locationId, contactId, t);
  if (!r.changes) return false;
  touchContact(contactId);
  addActivity(locationId, contactId, "tag_added", `Tag added: ${t}`, undefined, opts.userId);
  if (!opts.silent) emitEvent(locationId, { type: "tag_added", contactId, data: { tag: t } });
  return true;
}

export function removeTag(locationId: string, contactId: string, tag: string, opts: { userId?: string } = {}) {
  const r = db().prepare("DELETE FROM contact_tags WHERE contact_id = ? AND tag = ?").run(contactId, normalizeTag(tag));
  if (!r.changes) return false;
  touchContact(contactId);
  addActivity(locationId, contactId, "tag_removed", `Tag removed: ${tag}`, undefined, opts.userId);
  return true;
}

// ───────── activity timeline ─────────

export interface Activity {
  id: number;
  contact_id: string | null;
  type: string;
  summary: string;
  data: Record<string, unknown> | null;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
}

export function addActivity(locationId: string, contactId: string | null, type: string, summary: string, data?: Record<string, unknown>, userId?: string) {
  db()
    .prepare("INSERT INTO activities (location_id, contact_id, type, summary, data, user_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(locationId, contactId, type, summary.slice(0, 2000), data ? JSON.stringify(data) : null, userId ?? null);
}

export function listActivities(contactId: string, limit = 100): Activity[] {
  return (
    db()
      .prepare(
        `SELECT a.id, a.contact_id, a.type, a.summary, a.data, a.user_id, u.name AS user_name, a.created_at
         FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.contact_id = ? ORDER BY a.id DESC LIMIT ?`,
      )
      .all(contactId, limit) as (Omit<Activity, "data"> & {
      data: string | null;
    })[]
  ).map((a) => ({ ...a, data: a.data ? JSON.parse(a.data) : null }));
}

export function deleteNote(locationId: string, activityId: number) {
  db().prepare("DELETE FROM activities WHERE id = ? AND location_id = ? AND type = 'note'").run(activityId, locationId);
}

// ───────── tasks ─────────

export interface Task {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  title: string;
  due_at: string | null;
  done: boolean;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
}

const TASK_SELECT = `SELECT t.id, t.contact_id, TRIM(c.first_name || ' ' || c.last_name) AS contact_name, t.title, t.due_at, t.done,
  t.assignee_id, u.name AS assignee_name, t.created_at
  FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN users u ON u.id = t.assignee_id`;

const toTask = (r: Row) => ({ ...(r as unknown as Task), done: !!r.done });

export function listTasks(locationId: string, opts: { contactId?: string; open?: boolean; limit?: number } = {}): Task[] {
  const where = ["t.location_id = ?"];
  const args: unknown[] = [locationId];
  if (opts.contactId) {
    where.push("t.contact_id = ?");
    args.push(opts.contactId);
  }
  if (opts.open) where.push("t.done = 0");
  return (
    db()
      .prepare(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.done, t.due_at IS NULL, t.due_at, t.created_at DESC LIMIT ?`)
      .all(...args, opts.limit ?? 200) as Row[]
  ).map(toTask);
}

export function getTask(id: string) {
  const r = db().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as (Row & { location_id: string }) | undefined;
  return r ?? null;
}

export function createTask(
  locationId: string,
  input: {
    title: string;
    contactId?: string | null;
    dueAt?: string | null;
    assigneeId?: string | null;
  },
) {
  const id = nanoid(12);
  db()
    .prepare("INSERT INTO tasks (id, location_id, contact_id, title, due_at, assignee_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, locationId, input.contactId ?? null, input.title.trim().slice(0, 300), input.dueAt ?? null, input.assigneeId ?? null);
  if (input.contactId) addActivity(locationId, input.contactId, "task", `Task created: ${input.title}`);
  return id;
}

export function updateTask(id: string, patch: { title?: string; done?: boolean; dueAt?: string | null }) {
  if (patch.title !== undefined) db().prepare("UPDATE tasks SET title = ? WHERE id = ?").run(patch.title.trim().slice(0, 300), id);
  if (patch.done !== undefined)
    db()
      .prepare("UPDATE tasks SET done = ? WHERE id = ?")
      .run(patch.done ? 1 : 0, id);
  if (patch.dueAt !== undefined) db().prepare("UPDATE tasks SET due_at = ? WHERE id = ?").run(patch.dueAt, id);
}

export function deleteTask(id: string) {
  db().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}
