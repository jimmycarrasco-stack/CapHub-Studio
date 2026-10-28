import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteUser, getUserById, listUsersWithMemberships, requireAgencyAdmin, setUserPassword, updateUser } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const me = await requireAgencyAdmin();
  const target = getUserById((await ctx.params).id);
  if (!target) throw new HttpError(404, "User not found");
  // Only the owner can change the owner or other admins.
  if (target.agency_role && me.agency_role !== "owner" && target.id !== me.id) throw new HttpError(403, "Only the agency owner can change other admins");
  if (target.agency_role === "owner" && target.id !== me.id) throw new HttpError(403, "The owner account can only be changed by the owner");
  return { me, target };
}

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { me, target } = await load(ctx);
  const b = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      agencyAdmin: z.boolean().optional(),
      password: z.string().min(10, "Passwords need at least 10 characters").max(200).optional(),
    }),
  );
  if (b.agencyAdmin !== undefined) {
    if (target.agency_role === "owner") throw new HttpError(400, "The owner always has agency access");
    if (me.agency_role !== "owner") throw new HttpError(403, "Only the agency owner can grant or remove agency access");
    updateUser(target.id, { agencyRole: b.agencyAdmin ? "admin" : null });
  }
  if (b.name) updateUser(target.id, { name: b.name });
  if (b.password) await setUserPassword(target.id, b.password);
  return NextResponse.json(listUsersWithMemberships());
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { me, target } = await load(ctx);
  if (target.id === me.id) throw new HttpError(400, "You can't delete your own account");
  deleteUser(target.id);
  return NextResponse.json(listUsersWithMemberships());
});
