import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteLocation, getLocation, listAllLocations, requireAgencyAdmin, setLocationStatus, updateLocation } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, parseBody } from "@/lib/http";
import { locationSchema } from "@/lib/crm/schemas";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  await requireAgencyAdmin();
  const loc = getLocation((await ctx.params).id);
  if (!loc) throw new HttpError(404, "Sub-account not found");
  return loc;
}

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const loc = await load(ctx);
  const body = await parseBody(req, locationSchema.partial().extend({ status: z.enum(["active", "suspended"]).optional() }));
  const { status, ...rest } = body;
  if (status) setLocationStatus(loc.id, status);
  return NextResponse.json(updateLocation(loc.id, rest));
});

/**
 * Deletes a sub-account and ALL its data. The client must send the sub-account's exact name to confirm.
 * Refused while it still has App Builder apps (their containers must be removed first).
 */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const loc = await load(ctx);
  const { confirmName } = await parseBody(req, z.object({ confirmName: z.string() }));
  if (confirmName.trim() !== loc.name) throw new HttpError(400, "Type the sub-account's name exactly to confirm");
  if (listAllLocations().length === 1) throw new HttpError(400, "You can't delete the last sub-account");
  const apps = (db().prepare("SELECT COUNT(*) AS n FROM apps WHERE location_id = ?").get(loc.id) as { n: number }).n;
  if (apps) throw new HttpError(400, `Delete this sub-account's ${apps} App Builder app(s) first, so their containers are cleaned up`);
  deleteLocation(loc.id);
  return NextResponse.json({ ok: true });
});
