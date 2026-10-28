import "server-only";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import { HttpError } from "../errors";
import { appConfig } from "./config";

export interface AppRow {
  id: string;
  name: string;
  template: string;
  port: number;
  db_name: string;
  github_repo: string | null;
  location_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSecrets {
  dbPassword: string;
  authSecret: string;
}

export interface AppMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  events: AgentEventLog[] | null;
  created_at: string;
}

/** Compact, persisted record of what the agent did during a turn. */
export type AgentEventLog =
  | { t: "text"; text: string }
  | { t: "tool"; name: string; summary: string; ok: boolean; preview?: string };

export interface Snapshot {
  id: number;
  note: string;
  files: number;
  created_at: string;
}

const PUBLIC_COLS = "id, name, template, port, db_name, github_repo, location_id, created_at, updated_at";

export function listApps(locationId: string): AppRow[] {
  return db().prepare(`SELECT ${PUBLIC_COLS} FROM apps WHERE location_id = ? ORDER BY updated_at DESC`).all(locationId) as AppRow[];
}

export function getApp(id: string): AppRow | null {
  return (db().prepare(`SELECT ${PUBLIC_COLS} FROM apps WHERE id = ?`).get(id) as AppRow | undefined) ?? null;
}

export function requireApp(id: string): AppRow {
  const app = getApp(id);
  if (!app) throw new HttpError(404, "App not found");
  return app;
}

export function getAppSecrets(id: string): AppSecrets {
  const r = db().prepare("SELECT db_password, auth_secret FROM apps WHERE id = ?").get(id) as { db_password: string; auth_secret: string };
  return { dbPassword: decrypt(r.db_password), authSecret: decrypt(r.auth_secret) };
}

function nextPort(): number {
  const [lo, hi] = appConfig.portRange;
  const used = new Set((db().prepare("SELECT port FROM apps").all() as { port: number }[]).map((r) => r.port));
  for (let p = lo; p <= hi; p++) if (!used.has(p)) return p;
  throw new HttpError(409, "No free preview ports left — delete an app or widen CAPHUB_APP_PORTS");
}

export function createAppRow(name: string, locationId: string): AppRow {
  // Lowercase alphanumerics: safe for container, volume and Postgres identifiers.
  const id = nanoid(10).toLowerCase().replace(/[^a-z0-9]/g, "x");
  db()
    .prepare("INSERT INTO apps (id, name, port, db_name, db_password, auth_secret, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, name, nextPort(), `app_${id}`, encrypt(randomBytes(24).toString("base64url")), encrypt(randomBytes(32).toString("base64url")), locationId);
  return getApp(id)!;
}

export function updateApp(id: string, patch: { name?: string; github_repo?: string | null }) {
  if (patch.name !== undefined) db().prepare("UPDATE apps SET name = ?, updated_at = datetime('now') WHERE id = ?").run(patch.name, id);
  if (patch.github_repo !== undefined) db().prepare("UPDATE apps SET github_repo = ? WHERE id = ?").run(patch.github_repo, id);
  return getApp(id);
}

export function touchApp(id: string) {
  db().prepare("UPDATE apps SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function deleteAppRow(id: string) {
  db().prepare("DELETE FROM apps WHERE id = ?").run(id);
}

// ───────── messages ─────────

export function listAppMessages(appId: string): AppMessage[] {
  return (db().prepare("SELECT * FROM app_messages WHERE app_id = ? ORDER BY id").all(appId) as (Omit<AppMessage, "events"> & { events: string | null })[]).map(
    (r) => ({ ...r, events: r.events ? JSON.parse(r.events) : null }),
  );
}

export function addAppMessage(appId: string, role: "user" | "assistant", content: string, events?: AgentEventLog[]) {
  db().prepare("INSERT INTO app_messages (app_id, role, content, events) VALUES (?, ?, ?, ?)").run(appId, role, content, events ? JSON.stringify(events) : null);
  touchApp(appId);
}

// ───────── snapshots ─────────

export function insertSnapshot(appId: string, note: string): number {
  return Number(db().prepare("INSERT INTO app_snapshots (app_id, note) VALUES (?, ?)").run(appId, note.slice(0, 300)).lastInsertRowid);
}

export function setSnapshotFiles(id: number, files: number) {
  db().prepare("UPDATE app_snapshots SET files = ? WHERE id = ?").run(files, id);
}

export function listSnapshots(appId: string): Snapshot[] {
  return db().prepare("SELECT id, note, files, created_at FROM app_snapshots WHERE app_id = ? ORDER BY id DESC").all(appId) as Snapshot[];
}

export function getSnapshot(appId: string, id: number): Snapshot | null {
  return (db().prepare("SELECT id, note, files, created_at FROM app_snapshots WHERE app_id = ? AND id = ?").get(appId, id) as Snapshot | undefined) ?? null;
}

/** Deletes rows beyond the newest `keep`; returns the removed ids so their files can be deleted. */
export function pruneSnapshots(appId: string, keep = 30): number[] {
  const old = db().prepare("SELECT id FROM app_snapshots WHERE app_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?").all(appId, keep) as { id: number }[];
  for (const r of old) db().prepare("DELETE FROM app_snapshots WHERE id = ?").run(r.id);
  return old.map((r) => r.id);
}
