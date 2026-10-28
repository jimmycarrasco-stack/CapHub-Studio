import { NextResponse } from "next/server";
import { z } from "zod";
import { listLocationTeam, removeMembership, requireCtx, setMembership } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ userId: string }> };

async function member(ctx: Ctx) {
  const access = await requireCtx("admin");
  const userId = (await ctx.params).userId;
  if (!listLocationTeam(access.location.id).some((m) => m.id === userId)) throw new HttpError(404, "Not a member of this sub-account");
  return { access, userId };
}

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { access, userId } = await member(ctx);
  const { role } = await parseBody(req, z.object({ role: z.enum(["admin", "user"]) }));
  if (userId === access.user.id && role !== "admin" && !access.isAgencyAdmin) throw new HttpError(400, "You can't remove your own admin access");
  setMembership(userId, access.location.id, role);
  return NextResponse.json(listLocationTeam(access.location.id));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { access, userId } = await member(ctx);
  if (userId === access.user.id && !access.isAgencyAdmin) throw new HttpError(400, "You can't remove yourself");
  removeMembership(userId, access.location.id);
  return NextResponse.json(listLocationTeam(access.location.id));
});
