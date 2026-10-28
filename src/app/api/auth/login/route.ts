import { NextResponse } from "next/server";
import { z } from "zod";
import { appSecret } from "@/lib/crypto";
import { clientIp, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session";

export const POST = handle(async (req: Request) => {
  rateLimit(`login:${clientIp(req)}`, 10, 10 * 60_000); // 10 attempts / 10 min
  const { password } = await parseBody(req, z.object({ password: z.string().min(1).max(500) }));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(500, "ADMIN_PASSWORD is not set. Run `npm run setup` or set it in .env.local.");
  if (!(await passwordMatches(password, expected))) throw new HttpError(401, "Incorrect password");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(appSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
});
