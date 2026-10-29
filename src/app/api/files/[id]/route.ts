import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { deleteFile, getFile, readFileData } from "@/lib/crm/files";
import { handle, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const f = getFile((await ctx.params).id);
  if (!f) throw new HttpError(404, "File not found");
  await requireAccess(f.location_id);
  return f;
}

/** Download (always as an attachment, never rendered inline). */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const f = await load(ctx);
  const data = await readFileData(f).catch(() => {
    throw new HttpError(404, "File is missing from disk");
  });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const f = await load(ctx);
  await deleteFile(f);
  return NextResponse.json({ ok: true });
});
