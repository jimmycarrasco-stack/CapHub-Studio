import { NextResponse } from "next/server";
import { z } from "zod";
import { contactFor } from "@/lib/guards";
import { addActivity, deleteNote, touchContact } from "@/lib/crm/contacts";
import { handle, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { rec: c, ctx: access } = await contactFor((await ctx.params).id);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(1).max(5000) }));
  addActivity(c.location_id, c.id, "note", text, undefined, access.user.id);
  touchContact(c.id);
  return NextResponse.json({ ok: true }, { status: 201 });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { rec: c } = await contactFor((await ctx.params).id);
  const noteId = Number(new URL(req.url).searchParams.get("noteId"));
  deleteNote(c.location_id, noteId);
  return NextResponse.json({ ok: true });
});
