import { NextResponse } from "next/server";
import { siteFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { listSiteVersions } from "@/lib/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await siteFor(id);
  return NextResponse.json(listSiteVersions(id));
});
