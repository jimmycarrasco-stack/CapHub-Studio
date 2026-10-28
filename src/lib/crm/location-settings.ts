import "server-only";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";

/**
 * Per-sub-account settings (Stripe keys, SMTP, etc.). Secret values are encrypted with APP_SECRET.
 */

const SECRET_KEYS = new Set(["stripe_secret_key", "stripe_webhook_secret", "smtp_pass"]);

export function getLocSetting(locationId: string, key: string): string | null {
  const r = db().prepare("SELECT value FROM location_settings WHERE location_id = ? AND key = ?").get(locationId, key) as { value: string } | undefined;
  if (!r) return null;
  if (!SECRET_KEYS.has(key)) return r.value;
  try {
    return decrypt(r.value);
  } catch {
    return null; // APP_SECRET changed
  }
}

export function setLocSetting(locationId: string, key: string, value: string | null) {
  if (value === null || value === "") {
    db().prepare("DELETE FROM location_settings WHERE location_id = ? AND key = ?").run(locationId, key);
    return;
  }
  const stored = SECRET_KEYS.has(key) ? encrypt(value) : value;
  db()
    .prepare("INSERT INTO location_settings (location_id, key, value) VALUES (?, ?, ?) ON CONFLICT(location_id, key) DO UPDATE SET value = excluded.value")
    .run(locationId, key, stored);
}

/** Last 4 chars of a secret for display, or null. Secrets never go back to the browser. */
export function secretHint(locationId: string, key: string) {
  const v = getLocSetting(locationId, key);
  return v ? v.slice(-4) : null;
}
