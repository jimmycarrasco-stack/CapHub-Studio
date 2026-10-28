import { NextResponse } from "next/server";
import { handle, HttpError, requireAdmin } from "@/lib/http";
import { getSite, listSiteVersions } from "@/lib/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  if (!getSite(id)) throw new HttpError(404, "Site not found");
  return NextResponse.json(listSiteVersions(id));
});
