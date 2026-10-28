import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { LOCATION_COOKIE } from "@/lib/session";
import { cookieOpts } from "@/lib/cookies";

/** Switch the sub-account the user is working in. */
export const POST = handle(async (req: Request) => {
  const { locationId } = await parseBody(req, z.object({ locationId: z.string().min(1).max(40) }));
  await requireAccess(locationId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCATION_COOKIE, locationId, cookieOpts);
  return res;
});
