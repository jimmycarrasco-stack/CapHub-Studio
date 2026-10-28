import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { createSite, listSites } from "@/lib/repo";
import { nameFromPrompt } from "@/lib/site-builder";

export const GET = handle(async () => {
  await requireAdmin();
  return NextResponse.json(listSites());
});

/** Creates an empty project. The client then calls /generate with the first prompt. */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const body = await parseBody(req, z.object({ name: z.string().max(120).optional(), prompt: z.string().max(20_000).optional() }));
  const name = body.name?.trim() || (body.prompt ? nameFromPrompt(body.prompt) : "Untitled site");
  return NextResponse.json(createSite(name), { status: 201 });
});
