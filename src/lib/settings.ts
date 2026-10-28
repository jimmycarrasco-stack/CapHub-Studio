import "server-only";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import { PROVIDERS, DEFAULT_MODELS, ENV_KEYS, type ProviderName } from "./llm/catalog";

/**
 * Admin-controlled AI settings stored in SQLite.
 * API keys saved here are encrypted (see crypto.ts) and take priority over env vars.
 */

function get(key: string): string | undefined {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

function set(key: string, value: string | null) {
  if (value === null) db().prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export type KeySource = "settings" | "env" | "none";

export interface ProviderStatus {
  model: string;
  keySource: KeySource;
  keyHint: string | null; // last 4 characters only — the key itself never leaves the server
}

export interface AiSettings {
  activeProvider: ProviderName;
  providers: Record<ProviderName, ProviderStatus>;
}

function storedKey(p: ProviderName): string | undefined {
  const enc = get(`${p}_api_key`);
  if (!enc) return undefined;
  try {
    return decrypt(enc);
  } catch {
    // APP_SECRET changed since the key was saved; treat as missing.
    return undefined;
  }
}

export function resolveProvider(p: ProviderName): { apiKey: string | undefined; model: string; keySource: KeySource } {
  const fromSettings = storedKey(p);
  const fromEnv = process.env[ENV_KEYS[p]]?.trim() || undefined;
  const apiKey = fromSettings ?? fromEnv;
  return {
    apiKey,
    model: get(`${p}_model`) || DEFAULT_MODELS[p],
    keySource: fromSettings ? "settings" : fromEnv ? "env" : "none",
  };
}

export function getActiveProvider(): ProviderName {
  const v = get("active_provider");
  return (PROVIDERS as readonly string[]).includes(v ?? "") ? (v as ProviderName) : "anthropic";
}

export function getAiSettings(): AiSettings {
  const providers = {} as Record<ProviderName, ProviderStatus>;
  for (const p of PROVIDERS) {
    const r = resolveProvider(p);
    providers[p] = { model: r.model, keySource: r.keySource, keyHint: r.apiKey ? r.apiKey.slice(-4) : null };
  }
  return { activeProvider: getActiveProvider(), providers };
}

export interface AiSettingsUpdate {
  activeProvider?: ProviderName;
  providers?: Partial<Record<ProviderName, { model?: string; apiKey?: string | null }>>;
}

/** apiKey: a string saves (encrypted), null removes the stored key, undefined leaves it alone. */
export function updateAiSettings(update: AiSettingsUpdate) {
  db().transaction(() => {
    if (update.activeProvider) set("active_provider", update.activeProvider);
    for (const p of PROVIDERS) {
      const u = update.providers?.[p];
      if (!u) continue;
      if (u.model !== undefined) set(`${p}_model`, u.model.trim() || null);
      if (u.apiKey === null) set(`${p}_api_key`, null);
      else if (typeof u.apiKey === "string" && u.apiKey.trim()) set(`${p}_api_key`, encrypt(u.apiKey.trim()));
    }
  })();
}
