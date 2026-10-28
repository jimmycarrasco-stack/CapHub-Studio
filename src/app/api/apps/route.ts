import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { listApps } from "@/lib/apps/repo";
import { createApp } from "@/lib/apps/service";
import { nameFromPrompt } from "@/lib/site-builder";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listApps(location.id));
});

/** Creates the app from the starter template. The client then posts the first prompt to /chat. */
export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const body = await parseBody(req, z.object({ name: z.string().trim().max(80).optional(), prompt: z.string().max(20_000).optional() }));
  const name = body.name || (body.prompt ? nameFromPrompt(body.prompt) : "Untitled app");
  return NextResponse.json(await createApp(name, location.id), { status: 201 });
});
