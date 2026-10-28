import Papa from "papaparse";
import { requireCtx } from "@/lib/auth";
import { listContacts } from "@/lib/crm/contacts";
import { handle } from "@/lib/http";
import { slugify } from "@/lib/site-builder";

const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v); // spreadsheet formula injection

export const GET = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const { contacts } = listContacts(location.id, { q: sp.get("q") ?? undefined, tag: sp.get("tag") ?? undefined, limit: 500, offset: 0 });
  let all = contacts;
  for (let off = 500; all.length === off; off += 500) {
    all = all.concat(listContacts(location.id, { q: sp.get("q") ?? undefined, tag: sp.get("tag") ?? undefined, limit: 500, offset: off }).contacts);
  }
  const customKeys = [...new Set(all.flatMap((c) => Object.keys(c.custom)))];
  const rows = all.map((c) => ({
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    company: c.company,
    tags: c.tags.join(", "),
    source: c.source,
    do_not_contact: c.dnd ? "yes" : "",
    created_at: c.created_at,
    ...Object.fromEntries(customKeys.map((k) => [k, c.custom[k] ?? ""])),
  }));
  const csv = Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(String(v))]))));
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slugify(location.name)}-contacts.csv"` },
  });
});
