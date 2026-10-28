import JSZip from "jszip";
import { handle, requireAdmin } from "@/lib/http";
import { collectFiles } from "@/lib/apps/files";
import { requireApp } from "@/lib/apps/repo";
import { slugify } from "@/lib/site-builder";

/** Downloads the project source as a zip (no node_modules, build output or secrets). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  const slug = slugify(app.name);
  const zip = new JSZip();
  const folder = zip.folder(slug)!;
  for (const [p, data] of await collectFiles(app.id)) folder.file(p, data);
  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(buf as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}.zip"` },
  });
});
