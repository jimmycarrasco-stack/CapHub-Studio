import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { createAutomation, listAutomations } from "@/lib/crm/automations";
import { handle, HttpError } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listAutomations(location.id));
});

export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
  return NextResponse.json(createAutomation(location.id, raw), { status: 201 });
});
