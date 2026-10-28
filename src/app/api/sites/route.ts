import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { createSite, listSites } from "@/lib/repo";
import { nameFromPrompt } from "@/lib/site-builder";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listSites(location.id));
});

/** Creates an empty project in the current sub-account. The client then calls /generate with the first prompt. */
export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const body = await parseBody(req, z.object({ name: z.string().max(120).optional(), prompt: z.string().max(20_000).optional() }));
  const name = body.name?.trim() || (body.prompt ? nameFromPrompt(body.prompt) : "Untitled site");
  return NextResponse.json(createSite(name, location.id), { status: 201 });
});
