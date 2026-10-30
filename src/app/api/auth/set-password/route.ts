import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserById, listUserLocations, setUserPassword } from "@/lib/auth";
import { cookieOpts } from "@/lib/cookies";
import { appSecret } from "@/lib/crypto";
import { clientIp, handle, parseBody, rateLimit } from "@/lib/http";
import { consumePasswordToken } from "@/lib/password-tokens";
import { createSessionToken, LOCATION_COOKIE, SESSION_COOKIE } from "@/lib/session";

/** Sets a password from a one-time link, then signs the user in. */
export const POST = handle(async (req: Request) => {
  rateLimit(`setpw:${clientIp(req)}`, 10, 10 * 60_000);
  const { token, password } = await parseBody(
    req,
    z.object({ token: z.string().min(20).max(100), password: z.string().min(10, "Use at least 10 characters").max(200) }),
  );
  const userId = consumePasswordToken(token);
  await setUserPassword(userId, password);
  const user = getUserById(userId)!;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(appSecret(), user.id), cookieOpts);
  const first = listUserLocations(user)[0];
  if (first) res.cookies.set(LOCATION_COOKIE, first.id, cookieOpts);
  return res;
});
