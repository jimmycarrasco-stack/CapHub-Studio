import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserWithHashByEmail, listUserLocations } from "@/lib/auth";
import { appSecret } from "@/lib/crypto";
import { clientIp, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { verifyPassword } from "@/lib/passwords";
import { cookieOpts } from "@/lib/cookies";
import { hashPassword } from "@/lib/passwords";
import { createSessionToken, LOCATION_COOKIE, SESSION_COOKIE } from "@/lib/session";

// Compared against when the email doesn't exist, so response time doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;

export const POST = handle(async (req: Request) => {
  rateLimit(`login:${clientIp(req)}`, 10, 10 * 60_000); // 10 attempts / 10 min
  const { email, password } = await parseBody(req, z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(500) }));
  const user = getUserWithHashByEmail(email);
  // Same message and similar timing whether or not the email exists.
  const ok = await verifyPassword(password, user ? user.password_hash : await (dummyHash ??= hashPassword("not-a-real-password")));
  if (!user || !ok) throw new HttpError(401, "Incorrect email or password");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(appSecret(), user.id), cookieOpts);
  const first = listUserLocations(user)[0];
  if (first) res.cookies.set(LOCATION_COOKIE, first.id, cookieOpts);
  return res;
});
