import "server-only";
import { nanoid } from "nanoid";
import { db } from "./db";
import { slugify } from "./site-builder";

// ───────────────────────── Types ─────────────────────────

export interface Site {
  id: string;
  name: string;
  slug: string;
  html: string;
  published: boolean;
  agent_id: string | null;
  location_id: string | null;
  pending_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteSummary extends Omit<Site, "html"> {
  submissions: number;
}

export interface SiteMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface SiteVersion {
  id: number;
  note: string;
  created_at: string;
}

export interface Submission {
  id: number;
  form_name: string;
  data: Record<string, string>;
  page_url: string;
  created_at: string;
}

export interface Agent {
  id: string;
  location_id: string | null;
  name: string;
  description: string;
  instructions: string;
  guardrails: string;
  greeting: string;
  provider: "default" | "anthropic" | "openai";
  model: string | null;
  temperature: number | null;
  widget_enabled: boolean;
  widget_color: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeItem {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  created_at: string;
}

type Row = Record<string, unknown>;
const toSite = (r: Row) => ({ ...r, published: !!r.published }) as unknown as Site;
const toAgent = (r: Row) => ({ ...r, widget_enabled: !!r.widget_enabled }) as unknown as Agent;

// ───────────────────────── Sites ─────────────────────────

export function listSites(locationId: string): SiteSummary[] {
  return (
    db()
      .prepare(
        `SELECT s.id, s.name, s.slug, s.published, s.agent_id, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM form_submissions f WHERE f.site_id = s.id) AS submissions
         FROM sites s WHERE s.location_id = ? ORDER BY s.updated_at DESC`,
      )
      .all(locationId) as Row[]
  ).map((r) => ({ ...r, published: !!r.published }) as unknown as SiteSummary);
}

export function getSite(id: string): Site | null {
  const r = db().prepare("SELECT * FROM sites WHERE id = ?").get(id) as Row | undefined;
  return r ? toSite(r) : null;
}

export function getPublishedSiteBySlug(slug: string): Site | null {
  const r = db().prepare("SELECT * FROM sites WHERE slug = ? AND published = 1").get(slug) as Row | undefined;
  return r ? toSite(r) : null;
}

function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base);
  let slug = root;
  for (let n = 2; ; n++) {
    const hit = db().prepare("SELECT id FROM sites WHERE slug = ?").get(slug) as { id: string } | undefined;
    if (!hit || hit.id === excludeId) return slug;
    slug = `${root}-${n}`;
  }
}

export function createSite(name: string, locationId: string, pendingPrompt?: string): Site {
  const id = nanoid(12);
  db().prepare("INSERT INTO sites (id, name, slug, location_id, pending_prompt) VALUES (?, ?, ?, ?, ?)").run(id, name, uniqueSlug(name), locationId, pendingPrompt ?? null);
  return getSite(id)!;
}

/** Returns and clears a prompt queued by the AI Guide, so the editor can run it once. */
export function takePendingPrompt(siteId: string): string | null {
  const r = db().prepare("SELECT pending_prompt FROM sites WHERE id = ?").get(siteId) as { pending_prompt: string | null } | undefined;
  if (r?.pending_prompt) db().prepare("UPDATE sites SET pending_prompt = NULL WHERE id = ?").run(siteId);
  return r?.pending_prompt ?? null;
}

export function updateSite(id: string, patch: Partial<Pick<Site, "name" | "slug" | "published" | "agent_id">>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, val: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(val);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.slug !== undefined) add("slug", uniqueSlug(patch.slug, id));
  if (patch.published !== undefined) add("published", patch.published ? 1 : 0);
  if (patch.agent_id !== undefined) add("agent_id", patch.agent_id);
  if (!sets.length) return getSite(id);
  sets.push("updated_at = datetime('now')");
  db().prepare(`UPDATE sites SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  return getSite(id);
}

export function deleteSite(id: string) {
  db().prepare("DELETE FROM sites WHERE id = ?").run(id);
}

/** Saves new HTML as the current page and records a version. Returns the version id. */
export function saveSiteHtml(id: string, html: string, note: string): number {
  return db().transaction(() => {
    db().prepare("UPDATE sites SET html = ?, updated_at = datetime('now') WHERE id = ?").run(html, id);
    const info = db().prepare("INSERT INTO site_versions (site_id, html, note) VALUES (?, ?, ?)").run(id, html, note);
    // Keep the 50 most recent versions per site.
    db()
      .prepare(
        "DELETE FROM site_versions WHERE site_id = ? AND id NOT IN (SELECT id FROM site_versions WHERE site_id = ? ORDER BY id DESC LIMIT 50)",
      )
      .run(id, id);
    return Number(info.lastInsertRowid);
  })();
}

export function listSiteVersions(siteId: string): SiteVersion[] {
  return db().prepare("SELECT id, note, created_at FROM site_versions WHERE site_id = ? ORDER BY id DESC").all(siteId) as SiteVersion[];
}

export function getSiteVersionHtml(siteId: string, versionId: number): string | null {
  const r = db().prepare("SELECT html FROM site_versions WHERE site_id = ? AND id = ?").get(siteId, versionId) as { html: string } | undefined;
  return r?.html ?? null;
}

export function listSiteMessages(siteId: string): SiteMessage[] {
  return db().prepare("SELECT id, role, content, created_at FROM site_messages WHERE site_id = ? ORDER BY id").all(siteId) as SiteMessage[];
}

export function addSiteMessage(siteId: string, role: "user" | "assistant", content: string) {
  db().prepare("INSERT INTO site_messages (site_id, role, content) VALUES (?, ?, ?)").run(siteId, role, content);
}

export function addSubmission(siteId: string, formName: string, data: Record<string, string>, pageUrl: string) {
  db()
    .prepare("INSERT INTO form_submissions (site_id, form_name, data, page_url) VALUES (?, ?, ?, ?)")
    .run(siteId, formName, JSON.stringify(data), pageUrl);
}

export function listSubmissions(siteId: string): Submission[] {
  return (
    db().prepare("SELECT id, form_name, data, page_url, created_at FROM form_submissions WHERE site_id = ? ORDER BY id DESC LIMIT 500").all(siteId) as Row[]
  ).map((r) => ({ ...r, data: JSON.parse(r.data as string) }) as Submission);
}

// ───────────────────────── Agents ─────────────────────────

export function listAgents(locationId: string): (Agent & { knowledge_count: number; conversation_count: number })[] {
  return (
    db()
      .prepare(
        `SELECT a.*,
          (SELECT COUNT(*) FROM knowledge k WHERE k.agent_id = a.id) AS knowledge_count,
          (SELECT COUNT(*) FROM conversations c WHERE c.agent_id = a.id) AS conversation_count
         FROM agents a WHERE a.location_id = ? ORDER BY a.updated_at DESC`,
      )
      .all(locationId) as Row[]
  ).map((r) => toAgent(r) as Agent & { knowledge_count: number; conversation_count: number });
}

export function getAgent(id: string): Agent | null {
  const r = db().prepare("SELECT * FROM agents WHERE id = ?").get(id) as Row | undefined;
  return r ? toAgent(r) : null;
}

export function createAgent(locationId: string, input: { name: string; description?: string; instructions?: string }): Agent {
  const id = nanoid(12);
  db()
    .prepare("INSERT INTO agents (id, name, description, instructions, location_id) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.name, input.description ?? "", input.instructions ?? "", locationId);
  return getAgent(id)!;
}

export type AgentPatch = Partial<
  Pick<Agent, "name" | "description" | "instructions" | "guardrails" | "greeting" | "provider" | "model" | "temperature" | "widget_enabled" | "widget_color">
>;

export function updateAgent(id: string, patch: AgentPatch) {
  const cols = ["name", "description", "instructions", "guardrails", "greeting", "provider", "model", "temperature", "widget_enabled", "widget_color"] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of cols) {
    if (patch[c] === undefined) continue;
    sets.push(`${c} = ?`);
    vals.push(c === "widget_enabled" ? (patch[c] ? 1 : 0) : patch[c]);
  }
  if (!sets.length) return getAgent(id);
  sets.push("updated_at = datetime('now')");
  db().prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  return getAgent(id);
}

export function deleteAgent(id: string) {
  db().prepare("DELETE FROM agents WHERE id = ?").run(id);
}

export function listKnowledge(agentId: string): KnowledgeItem[] {
  return db().prepare("SELECT * FROM knowledge WHERE agent_id = ? ORDER BY created_at").all(agentId) as KnowledgeItem[];
}

export function addKnowledge(agentId: string, title: string, content: string): KnowledgeItem {
  const id = nanoid(12);
  db().prepare("INSERT INTO knowledge (id, agent_id, title, content) VALUES (?, ?, ?, ?)").run(id, agentId, title, content);
  db().prepare("UPDATE agents SET updated_at = datetime('now') WHERE id = ?").run(agentId);
  return db().prepare("SELECT * FROM knowledge WHERE id = ?").get(id) as KnowledgeItem;
}

export function deleteKnowledge(agentId: string, id: string) {
  db().prepare("DELETE FROM knowledge WHERE agent_id = ? AND id = ?").run(agentId, id);
}

// ───────────────────────── Conversations ─────────────────────────

export function ensureConversation(agentId: string, conversationId: string | undefined, source: "playground" | "widget") {
  if (conversationId) {
    const hit = db().prepare("SELECT id FROM conversations WHERE id = ? AND agent_id = ?").get(conversationId, agentId);
    if (hit) return conversationId;
  }
  const id = nanoid(16);
  db().prepare("INSERT INTO conversations (id, agent_id, source) VALUES (?, ?, ?)").run(id, agentId, source);
  return id;
}

export function getConversationMessages(conversationId: string, limit = 40) {
  return (
    db().prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?").all(conversationId, limit) as {
      role: "user" | "assistant";
      content: string;
    }[]
  ).reverse();
}

export function addMessage(conversationId: string, role: "user" | "assistant", content: string) {
  db().prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)").run(conversationId, role, content);
  db().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
}

export function listConversations(agentId: string) {
  return db()
    .prepare(
      `SELECT c.id, c.source, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
         (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY id LIMIT 1) AS first_message
       FROM conversations c WHERE c.agent_id = ? ORDER BY c.updated_at DESC LIMIT 200`,
    )
    .all(agentId) as { id: string; source: string; created_at: string; updated_at: string; message_count: number; first_message: string | null }[];
}

export function getConversationForAgent(agentId: string, conversationId: string) {
  const hit = db().prepare("SELECT id FROM conversations WHERE id = ? AND agent_id = ?").get(conversationId, agentId);
  return hit ? getConversationMessages(conversationId, 1000) : null;
}

export function dashboardStats(locationId: string) {
  const one = (sql: string) => (db().prepare(sql).get(locationId) as { n: number }).n;
  return {
    sites: one("SELECT COUNT(*) AS n FROM sites WHERE location_id = ?"),
    published: one("SELECT COUNT(*) AS n FROM sites WHERE published = 1 AND location_id = ?"),
    agents: one("SELECT COUNT(*) AS n FROM agents WHERE location_id = ?"),
    submissions: one("SELECT COUNT(*) AS n FROM form_submissions f JOIN sites s ON s.id = f.site_id WHERE s.location_id = ?"),
    conversations: one("SELECT COUNT(*) AS n FROM conversations c JOIN agents a ON a.id = c.agent_id WHERE c.source = 'widget' AND a.location_id = ?"),
  };
}
