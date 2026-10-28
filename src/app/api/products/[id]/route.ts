import { NextResponse } from "next/server";
import { productFor } from "@/lib/guards";
import { deleteProduct, resyncProduct, updateProduct } from "@/lib/crm/payments";
import { handle, parseBody } from "@/lib/http";
import { productInputSchema } from "@/lib/crm/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { rec: p } = await productFor((await ctx.params).id);
  return NextResponse.json(await updateProduct(p.id, await parseBody(req, productInputSchema.partial())));
});

/** Retry syncing to Stripe. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: p } = await productFor((await ctx.params).id);
  return NextResponse.json(await resyncProduct(p.id));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: p } = await productFor((await ctx.params).id);
  return NextResponse.json(await deleteProduct(p.id));
});
