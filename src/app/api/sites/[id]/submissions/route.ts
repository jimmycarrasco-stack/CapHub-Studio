import { NextResponse } from "next/server";
import { handle, HttpError, requireAdmin } from "@/lib/http";
import { getSite, listSubmissions } from "@/lib/repo";

function csvCell(raw: string) {
  // Neutralize spreadsheet formula injection from visitor-supplied values.
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Lists form submissions. `?format=csv` downloads them. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const site = getSite(id);
  if (!site) throw new HttpError(404, "Site not found");
  const rows = listSubmissions(id);

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r.data)))];
    const header = ["submitted_at", "form", ...fields, "page_url"];
    const lines = rows.map((r) => [r.created_at, r.form_name, ...fields.map((f) => r.data[f] ?? ""), r.page_url].map(csvCell).join(","));
    return new Response([header.map(csvCell).join(","), ...lines].join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${site.slug}-submissions.csv"` },
    });
  }
  return NextResponse.json(rows);
});
