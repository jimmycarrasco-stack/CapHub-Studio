import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { addDomain, listDomains } from "@/lib/crm/domains";
import { handle, parseBody } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listDomains(location.id));
});

/** Connect a domain to a site or funnel (it goes live after DNS verification). Sub-account admins only. */
export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx("admin");
  const b = await parseBody(req, z.object({ domain: z.string().max(260), targetType: z.enum(["site", "funnel"]), targetId: z.string().max(40) }));
  return NextResponse.json(addDomain(location.id, b), { status: 201 });
});
