import { NextResponse } from "next/server";
import { z } from "zod";
import { createLocation, createUser, listAllLocations, userCount } from "@/lib/auth";
import { appSecret } from "@/lib/crypto";
import { clientIp, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { createSessionToken, LOCATION_COOKIE, passwordMatches, SESSION_COOKIE } from "@/lib/session";
import { cookieOpts } from "@/lib/cookies";
import { createPipeline } from "@/lib/crm/pipelines";

/**
 * First-run setup: creates the agency owner. Only works while there are no users, and requires
 * ADMIN_PASSWORD from .env.local as a setup key (proves you control the server).
 */
export const POST = handle(async (req: Request) => {
  rateLimit(`setup:${clientIp(req)}`, 10, 10 * 60_000);
  if (userCount() > 0) throw new HttpError(409, "Setup is already complete — sign in instead");
  const body = await parseBody(
    req,
    z.object({
      setupKey: z.string().min(1).max(500),
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(200),
      password: z.string().min(8, "Password must be at least 8 characters").max(200),
      locationName: z.string().trim().max(100).optional(),
    }),
  );
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(500, "ADMIN_PASSWORD is not set in .env.local");
  if (!(await passwordMatches(body.setupKey, expected))) throw new HttpError(401, "Setup key is incorrect (it's ADMIN_PASSWORD in .env.local)");

  const user = await createUser({ email: body.email, name: body.name, password: body.password, agencyRole: "owner" });
  if (!listAllLocations().length) {
    const loc = createLocation({ name: body.locationName || `${body.name.split(" ")[0]}'s business`, email: body.email });
    createPipeline(loc.id, "Sales pipeline");
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(appSecret(), user.id), cookieOpts);
  res.cookies.set(LOCATION_COOKIE, listAllLocations()[0].id, cookieOpts);
  return res;
});
