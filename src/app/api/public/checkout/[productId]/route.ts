import { NextResponse } from "next/server";
import { z } from "zod";
import { baseUrl, clientIp, corsPreflight, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { createCheckout, getProduct } from "@/lib/crm/payments";

export const OPTIONS = corsPreflight;

/** Starts a Stripe Checkout for a product. Used by /pay/<id> pages and checkout buttons on sites/funnels. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ productId: string }> }) => {
    rateLimit(`checkout:${clientIp(req)}`, 20, 60_000);
    const product = getProduct((await ctx.params).productId);
    if (!product) throw new HttpError(404, "Product not found");
    const body = await parseBody(req, z.object({ email: z.string().email().max(200).optional().or(z.literal("")), returnUrl: z.string().max(2000).optional() }));
    const base = baseUrl(req);
    // Only allow returning to pages on this server (no open redirects).
    const returnUrl = body.returnUrl && body.returnUrl.startsWith(`${base}/`) ? body.returnUrl : undefined;
    const url = await createCheckout(product, { baseUrl: base, email: body.email || undefined, returnUrl });
    return NextResponse.json({ url });
  },
  { cors: true },
);
