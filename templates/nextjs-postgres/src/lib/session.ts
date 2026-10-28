import { jwtVerify, SignJWT } from "jose";

/** Signed session token stored in an httpOnly cookie. Edge-safe (used by proxy.ts too). */

// Each app gets its own cookie name from the platform so apps previewed on the same host don't clash.
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "session";
const TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  userId: string;
  role: "user" | "admin";
}

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId, role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_SECONDS,
};
