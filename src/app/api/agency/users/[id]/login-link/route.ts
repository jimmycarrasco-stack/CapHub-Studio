import { NextResponse } from "next/server";
import { getUserById, requireAgencyAdmin } from "@/lib/auth";
import { baseUrl, handle, HttpError } from "@/lib/http";
import { createPasswordToken } from "@/lib/password-tokens";

/**
 * Agency admins: create a one-time "set your password" link for a user (e.g. a SaaS buyer whose
 * welcome email didn't arrive). Not for other agency admins unless you're the owner.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireAgencyAdmin();
  const user = getUserById((await ctx.params).id);
  if (!user) throw new HttpError(404, "User not found");
  if (user.agency_role && me.agency_role !== "owner" && user.id !== me.id) throw new HttpError(403, "Only the agency owner can do this for other admins");
  return NextResponse.json({ url: `${baseUrl(req)}/set-password?token=${createPasswordToken(user.id, 7)}`, expiresInDays: 7 });
});
