/**
 * Signed admin session tokens, using Web Crypto so the same code runs in the
 * proxy and in route handlers. Token: <expiresAtMs>.<hmac-sha256 base64url>.
 */

export const SESSION_COOKIE = "caphub_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()) {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

/** Constant-time password comparison via hashing both sides first. */
export async function passwordMatches(input: string, expected: string) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return safeEqual(b64url(a), b64url(b));
}
