import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgencyAdmin } from "@/lib/auth";
import { productFor } from "@/lib/guards";
import { setProductProvisions } from "@/lib/crm/payments";
import { handle, parseBody } from "@/lib/http";

/** Agency admins only: make buying this product create a sub-account for the buyer. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAgencyAdmin();
  const { rec: p } = await productFor((await ctx.params).id);
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  return NextResponse.json(setProductProvisions(p.id, enabled));
});
