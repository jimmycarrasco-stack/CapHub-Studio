import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { createTask, getContact, listTasks } from "@/lib/crm/contacts";
import { handle, HttpError, parseBody } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const { location } = await requireCtx();
  return NextResponse.json(listTasks(location.id, { open: new URL(req.url).searchParams.get("open") === "1" }));
});

export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const body = await parseBody(
    req,
    z.object({ title: z.string().trim().min(1).max(300), contactId: z.string().max(40).nullable().optional(), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }),
  );
  if (body.contactId && getContact(body.contactId)?.location_id !== location.id) throw new HttpError(404, "Contact not found");
  return NextResponse.json({ id: createTask(location.id, body) }, { status: 201 });
});
