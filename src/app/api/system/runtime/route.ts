import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { getGithubToken, setGithubToken } from "@/lib/apps/github";
import { runtimeStatus } from "@/lib/apps/runtime";

/** App Builder environment: Docker status, shared Postgres, GitHub token presence. */
export const GET = handle(async () => {
  await requireAdmin();
  const s = await runtimeStatus();
  const gh = getGithubToken();
  return NextResponse.json({
    docker: s.docker,
    postgres: s.postgres,
    appImage: s.images.appImage,
    pgImage: s.images.pgImage,
    github: { source: gh.source, hint: gh.token ? gh.token.slice(-4) : null },
  });
});

export const PUT = handle(async (req: Request) => {
  await requireAdmin();
  const { githubToken } = await parseBody(req, z.object({ githubToken: z.string().max(500).nullable() }));
  setGithubToken(githubToken && githubToken.trim() ? githubToken : null);
  return NextResponse.json({ ok: true });
});
