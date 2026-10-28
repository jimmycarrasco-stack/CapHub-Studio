import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { createContact, listContacts, listLocationTags } from "@/lib/crm/contacts";
import { contactInputSchema } from "@/lib/crm/schemas";
import { handle, parseBody } from "@/lib/http";


export const GET = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const result = listContacts(location.id, {
    q: sp.get("q") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    limit: Number(sp.get("limit")) || 50,
    offset: Number(sp.get("offset")) || 0,
  });
  return NextResponse.json({ ...result, tags: listLocationTags(location.id) });
});

export const POST = handle(async (req: Request) => {
  const { location, user } = await requireCtx();
  const body = await parseBody(req, contactInputSchema);
  return NextResponse.json(createContact(location.id, { ...body, email: body.email || null }, { userId: user.id }), { status: 201 });
});
