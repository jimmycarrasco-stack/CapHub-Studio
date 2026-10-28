import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { pushToGithub } from "@/lib/apps/github";
import { requireApp } from "@/lib/apps/repo";

export const maxDuration = 300;

/** Pushes the project to GitHub as one commit on the default branch. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  const body = await parseBody(
    req,
    z.object({ repo: z.string().max(200).optional(), private: z.boolean().optional(), message: z.string().max(500).optional() }),
  );
  return NextResponse.json(await pushToGithub(app.id, body));
});
