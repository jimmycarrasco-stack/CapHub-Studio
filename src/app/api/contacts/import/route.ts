import { NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { addTag, createContact, findContactByEmail, updateContact } from "@/lib/crm/contacts";
import { handle, HttpError, parseBody } from "@/lib/http";
import { contactFromForm } from "@/lib/site-builder";

export const maxDuration = 300;

/**
 * Imports contacts from CSV text. Common column names are detected (first/last name, name, email,
 * phone, company, tags); other columns become custom fields. Existing emails are updated, not duplicated.
 */
export const POST = handle(async (req: Request) => {
  const { location, user } = await requireCtx();
  const { csv, tag } = await parseBody(req, z.object({ csv: z.string().min(1).max(10_000_000), tag: z.string().max(50).optional() }));
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  if (!parsed.data.length) throw new HttpError(400, "No rows found — the first line should be column headers");
  if (parsed.data.length > 20_000) throw new HttpError(400, "Import up to 20,000 contacts at a time");

  const known = new Set(["firstname", "first", "fname", "lastname", "last", "lname", "surname", "name", "fullname", "email", "emailaddress", "phone", "phonenumber", "tel", "mobile", "company", "business", "businessname", "tags", "tag"]);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  parsed.data.forEach((row, i) => {
    try {
      const f = contactFromForm(row);
      if (!f.email && !f.phone && !f.first_name && !f.last_name) {
        skipped++;
        return;
      }
      const tagsCol = Object.entries(row).find(([k]) => /^tags?$/i.test(k.trim()))?.[1] ?? "";
      const tags = [...tagsCol.split(/[,;|]/), tag ?? ""].map((t) => t.trim()).filter(Boolean);
      const custom = Object.fromEntries(
        Object.entries(row).filter(([k, v]) => v && !known.has(k.toLowerCase().replace(/[^a-z]/g, ""))).map(([k, v]) => [k.slice(0, 60), String(v).slice(0, 2000)]),
      );
      const existing = f.email ? findContactByEmail(location.id, f.email) : null;
      if (existing) {
        updateContact(existing.id, { first_name: f.first_name || existing.first_name, last_name: f.last_name || existing.last_name, phone: f.phone || existing.phone, company: f.company || existing.company, custom }, { userId: user.id });
        for (const t of tags) addTag(location.id, existing.id, t, { userId: user.id });
        updated++;
      } else {
        createContact(location.id, { ...f, email: f.email || null, phone: f.phone || null, source: "import", custom, tags }, { userId: user.id });
        created++;
      }
    } catch (err) {
      skipped++;
      if (errors.length < 10) errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  });
  return NextResponse.json({ created, updated, skipped, errors });
});
