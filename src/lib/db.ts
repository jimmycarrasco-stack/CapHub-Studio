import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * SQLite access. One connection per server process (cached on globalThis so
 * Next.js dev hot-reloads don't open a new handle on every edit).
 */

type Migration = string | ((db: Database.Database) => void);

const MIGRATIONS: Migration[] = [
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
  // 3 — CRM: users, agency, sub-accounts (locations) and everything scoped to them
  (db: Database.Database) => {
    db.exec(`
    CREATE TABLE users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      agency_role   TEXT,                       -- owner | admin | NULL (sub-account users only)
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE locations (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      timezone   TEXT NOT NULL DEFAULT 'America/Winnipeg',
      email      TEXT NOT NULL DEFAULT '',
      phone      TEXT NOT NULL DEFAULT '',
      website    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE memberships (
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      role        TEXT NOT NULL DEFAULT 'user',  -- admin | user
      PRIMARY KEY (user_id, location_id)
    );

    -- Per-sub-account integration settings (secrets encrypted with APP_SECRET).
    CREATE TABLE location_settings (
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      PRIMARY KEY (location_id, key)
    );

    CREATE TABLE contacts (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      first_name  TEXT NOT NULL DEFAULT '',
      last_name   TEXT NOT NULL DEFAULT '',
      email       TEXT COLLATE NOCASE,
      phone       TEXT,
      company     TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT '',
      custom      TEXT NOT NULL DEFAULT '{}',    -- JSON object of custom fields
      dnd         INTEGER NOT NULL DEFAULT 0,    -- do not contact (no automated email/SMS)
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_contacts_loc ON contacts(location_id, updated_at);
    CREATE INDEX idx_contacts_email ON contacts(location_id, email);
    CREATE INDEX idx_contacts_phone ON contacts(location_id, phone);

    CREATE TABLE contact_tags (
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tag         TEXT NOT NULL COLLATE NOCASE,
      PRIMARY KEY (contact_id, tag)
    );
    CREATE INDEX idx_tags_loc ON contact_tags(location_id, tag);

    CREATE TABLE activities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      contact_id  TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      summary     TEXT NOT NULL,
      data        TEXT,
      user_id     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_activities_contact ON activities(contact_id, id);
    CREATE INDEX idx_activities_loc ON activities(location_id, id);

    CREATE TABLE tasks (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      contact_id  TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      due_at      TEXT,
      done        INTEGER NOT NULL DEFAULT 0,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_tasks_loc ON tasks(location_id, done, due_at);

    CREATE TABLE pipelines (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE stages (
      id          TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      position    INTEGER NOT NULL
    );
    CREATE TABLE opportunities (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      stage_id    TEXT NOT NULL REFERENCES stages(id),
      contact_id  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      title       TEXT NOT NULL,
      value_cents INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'open',   -- open | won | lost
      position    REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_opps_pipeline ON opportunities(pipeline_id, stage_id, position);
    CREATE INDEX idx_opps_contact ON opportunities(contact_id);

    CREATE TABLE products (
      id                TEXT PRIMARY KEY,
      location_id       TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      price_cents       INTEGER NOT NULL,
      currency          TEXT NOT NULL DEFAULT 'cad',
      interval          TEXT,                     -- NULL = one-time | month | year
      active            INTEGER NOT NULL DEFAULT 1,
      stripe_product_id TEXT,
      stripe_price_id   TEXT,
      sync_error        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_products_loc ON products(location_id);

    CREATE TABLE orders (
      id                TEXT PRIMARY KEY,
      location_id       TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      contact_id        TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      product_id        TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name      TEXT NOT NULL DEFAULT '',
      amount_cents      INTEGER NOT NULL,
      currency          TEXT NOT NULL,
      status            TEXT NOT NULL,             -- paid | refunded
      kind              TEXT NOT NULL DEFAULT 'one_time', -- one_time | subscription | renewal
      stripe_ref        TEXT UNIQUE,               -- checkout session / invoice id (idempotency)
      stripe_payment_intent TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_orders_loc ON orders(location_id, created_at);

    CREATE TABLE crm_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      contact_id  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      channel     TEXT NOT NULL,                  -- email | sms
      direction   TEXT NOT NULL,                  -- out | in
      to_addr     TEXT NOT NULL,
      from_addr   TEXT NOT NULL DEFAULT '',
      subject     TEXT NOT NULL DEFAULT '',
      body        TEXT NOT NULL,
      status      TEXT NOT NULL,                  -- sent | failed | received
      error       TEXT,
      provider_id TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_crm_messages_contact ON crm_messages(contact_id, id);
    CREATE INDEX idx_crm_messages_loc ON crm_messages(location_id, id);

    CREATE TABLE automations (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 0,
      trigger     TEXT NOT NULL,                  -- JSON {type, ...filters}
      steps       TEXT NOT NULL DEFAULT '[]',     -- JSON array of actions
      hook_secret TEXT NOT NULL,                  -- for the inbound webhook trigger URL
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_automations_loc ON automations(location_id);

    CREATE TABLE automation_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      location_id   TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      contact_id    TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      status        TEXT NOT NULL,                -- active | done | failed | cancelled
      step_index    INTEGER NOT NULL DEFAULT 0,
      next_run_at   TEXT NOT NULL,
      context       TEXT NOT NULL DEFAULT '{}',
      log           TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_runs_due ON automation_runs(status, next_run_at);
    CREATE INDEX idx_runs_automation ON automation_runs(automation_id, id);

    CREATE TABLE funnels (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE funnel_steps (
      funnel_id TEXT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
      site_id   TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      position  INTEGER NOT NULL,
      PRIMARY KEY (funnel_id, site_id)
    );

    ALTER TABLE sites ADD COLUMN location_id TEXT REFERENCES locations(id) ON DELETE CASCADE;
    ALTER TABLE sites ADD COLUMN pending_prompt TEXT;
    ALTER TABLE agents ADD COLUMN location_id TEXT REFERENCES locations(id) ON DELETE CASCADE;
    ALTER TABLE apps ADD COLUMN location_id TEXT REFERENCES locations(id) ON DELETE CASCADE;
    ALTER TABLE form_submissions ADD COLUMN contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL;
    `);

    // Existing sites, agents and apps move into a first sub-account.
    const counts = ["sites", "agents", "apps"].map((t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    if (counts.some((n) => n > 0)) {
      const id = "main" + Math.random().toString(36).slice(2, 8);
      db.prepare("INSERT INTO locations (id, name) VALUES (?, 'Main account')").run(id);
      for (const t of ["sites", "agents", "apps"]) db.prepare(`UPDATE ${t} SET location_id = ?`).run(id);
    }
  },
  // 4: email attachments (files library per sub-account) + starter pipeline for sub-accounts without one
  (db) => {
    db.exec(`
      CREATE TABLE crm_files (
        id          TEXT PRIMARY KEY,
        location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        mime        TEXT NOT NULL,
        size        INTEGER NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_crm_files_loc ON crm_files(location_id, created_at);
      ALTER TABLE crm_messages ADD COLUMN attachments TEXT;
    `);
    const empty = db.prepare("SELECT id FROM locations l WHERE NOT EXISTS (SELECT 1 FROM pipelines p WHERE p.location_id = l.id)").all() as { id: string }[];
    const stages = ["New lead", "Contacted", "Proposal sent", "Negotiation", "Closed"];
    for (const l of empty) {
      const pid = "p" + Math.random().toString(36).slice(2, 11);
      db.prepare("INSERT INTO pipelines (id, location_id, name) VALUES (?, ?, 'Sales pipeline')").run(pid, l.id);
      stages.forEach((name, i) =>
        db.prepare("INSERT INTO stages (id, pipeline_id, name, position) VALUES (?, ?, ?, ?)").run("s" + Math.random().toString(36).slice(2, 11), pid, name, i),
      );
    }
  },
];

export const MIGRATIONS_FOR_TESTS = MIGRATIONS;

export function migrate(db: Database.Database) {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      const m = MIGRATIONS[i];
      if (typeof m === "string") db.exec(m);
      else m(db);
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
