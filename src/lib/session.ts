/**
 * Signed session tokens, using Web Crypto so the same code runs in the proxy and in route
 * handlers. Token: <base64url(JSON {u: userId, e: expiresAtMs})>.<hmac-sha256 base64url>.
 */

export const SESSION_COOKIE = "caphub_session";
export const LOCATION_COOKIE = "caphub_loc";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();

function b64urlBytes(buf: ArrayBuffer | Uint8Array) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncode(text: string) {
  return b64urlBytes(enc.encode(text));
}

function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function hmac(secret: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64urlBytes(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, userId: string, now = Date.now()) {
  const payload = b64urlEncode(JSON.stringify({ u: userId, e: now + SESSION_TTL_MS }));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Returns the user id for a valid, unexpired token; otherwise null. */
export async function verifySessionToken(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<string | null> {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(secret, payload))) return null;
  try {
    const { u, e } = JSON.parse(b64urlDecode(payload)) as { u?: unknown; e?: unknown };
    if (typeof u !== "string" || typeof e !== "number" || e < now) return null;
    return u;
  } catch {
    return null;
  }
}

/** Constant-time password comparison via hashing both sides first (used for the setup key). */
export async function passwordMatches(input: string, expected: string) {
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(input)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  return safeEqual(b64urlBytes(a), b64urlBytes(b));
}
