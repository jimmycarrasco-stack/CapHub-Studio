import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * SQLite access. One connection per server process (cached on globalThis so
 * Next.js dev hot-reloads don't open a new handle on every edit).
 */

const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE agents (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    instructions   TEXT NOT NULL DEFAULT '',
    guardrails     TEXT NOT NULL DEFAULT '',
    greeting       TEXT NOT NULL DEFAULT 'Hi! How can I help you today?',
    provider       TEXT NOT NULL DEFAULT 'default',   -- default | anthropic | openai
    model          TEXT,                              -- NULL = provider default
    temperature    REAL,                              -- NULL = provider default
    widget_enabled INTEGER NOT NULL DEFAULT 0,
    widget_color   TEXT NOT NULL DEFAULT '#4f46e5',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE knowledge (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_knowledge_agent ON knowledge(agent_id);

  CREATE TABLE conversations (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    source     TEXT NOT NULL,                         -- playground | widget
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_conversations_agent ON conversations(agent_id, updated_at);

  CREATE TABLE messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,                    -- user | assistant
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_messages_conversation ON messages(conversation_id, id);

  CREATE TABLE sites (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    html       TEXT NOT NULL DEFAULT '',
    published  INTEGER NOT NULL DEFAULT 0,
    agent_id   TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE site_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,                         -- user | assistant
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_site_messages_site ON site_messages(site_id, id);

  CREATE TABLE site_versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    html       TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_site_versions_site ON site_versions(site_id, id);

  CREATE TABLE form_submissions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    form_name  TEXT NOT NULL DEFAULT 'form',
    data       TEXT NOT NULL,                         -- JSON object
    page_url   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_submissions_site ON form_submissions(site_id, id);
  `,
  // 2 — App Builder (full-stack apps)
  `
  CREATE TABLE apps (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    template    TEXT NOT NULL DEFAULT 'nextjs-postgres',
    port        INTEGER NOT NULL UNIQUE,
    db_name     TEXT NOT NULL,
    db_password TEXT NOT NULL,              -- encrypted
    auth_secret TEXT NOT NULL,              -- encrypted
    github_repo TEXT,                       -- owner/name after first push
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE app_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,               -- user | assistant
    content    TEXT NOT NULL,               -- user prompt, or assistant summary
    events     TEXT,                        -- JSON: compact log of the agent's steps
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_app_messages_app ON app_messages(app_id, id);

  CREATE TABLE app_snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    note       TEXT NOT NULL,
    files      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_app_snapshots_app ON app_snapshots(app_id, id);
  `,
];

export function migrate(db: Database.Database) {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

export function openDatabase(file: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { __caphubDb?: Database.Database };

export function db(): Database.Database {
  if (!globalForDb.__caphubDb) {
    const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "caphub.db");
    globalForDb.__caphubDb = openDatabase(file);
  }
  return globalForDb.__caphubDb;
}
