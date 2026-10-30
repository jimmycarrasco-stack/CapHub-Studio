import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { getDomain, verifyDomain } from "@/lib/crm/domains";
import { handle, HttpError, rateLimit } from "@/lib/http";

/** Re-checks DNS for a domain (TXT ownership record and where it points). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ domain: string }> }) => {
  const d = getDomain(decodeURIComponent((await ctx.params).domain));
  if (!d) throw new HttpError(404, "Domain not found");
  await requireAccess(d.location_id, "admin");
  rateLimit(`verify:${d.domain}`, 20, 60_000);
  return NextResponse.json(await verifyDomain(d));
});
