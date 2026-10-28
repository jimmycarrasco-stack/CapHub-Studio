import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { createProduct, listProducts } from "@/lib/crm/payments";
import { productInputSchema } from "@/lib/crm/schemas";
import { handle, parseBody } from "@/lib/http";


export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listProducts(location.id));
});

export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  return NextResponse.json(await createProduct(location.id, await parseBody(req, productInputSchema)), { status: 201 });
});
