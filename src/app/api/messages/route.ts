import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { listMessages } from "@/lib/crm/email";
import { handle } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listMessages(location.id, { limit: 300 }));
});
