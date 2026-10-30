import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./errors";

/**
 * One-time "set your password" links. Only a SHA-256 hash of the token is stored, links expire,
 * and each can be used once. Issuing a new link for a user invalidates their older unused ones.
 */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const sqlTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

export function createPasswordToken(userId: string, days = 7): string {
  const token = randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM password_tokens WHERE user_id = ? AND used_at IS NULL").run(userId);
  db().prepare("INSERT INTO password_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hash(token), userId, sqlTime(Date.now() + days * 86_400_000));
  return token;
}

/** Returns the user id for a valid, unused, unexpired token (without using it up). */
export function checkPasswordToken(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const r = db()
    .prepare("SELECT user_id FROM password_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')")
    .get(hash(token)) as { user_id: string } | undefined;
  return r?.user_id ?? null;
}

export function consumePasswordToken(token: string): string {
  const userId = checkPasswordToken(token);
  if (!userId) throw new HttpError(400, "This link is invalid or has expired. Ask your account admin for a new one.");
  db().prepare("UPDATE password_tokens SET used_at = datetime('now') WHERE token_hash = ?").run(hash(token));
  return userId;
}
