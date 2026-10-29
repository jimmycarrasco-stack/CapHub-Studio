import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { addTag, bulkDeleteContacts, getContact, matchingContactIds, removeTag } from "@/lib/crm/contacts";
import { handle, HttpError, parseBody } from "@/lib/http";

export const maxDuration = 300;

/**
 * Bulk actions on contacts: delete, add tag, remove tag. Targets either explicit ids or every
 * contact matching a search/tag filter. Deleting requires sub-account admin and the expected count
 * (so a filter that changed since the user looked can't delete more than they confirmed).
 */
export const POST = handle(async (req: Request) => {
  const b = await parseBody(
    req,
    z.object({
      action: z.enum(["delete", "add_tag", "remove_tag"]),
      ids: z.array(z.string().max(40)).max(50_000).optional(),
      filter: z.object({ q: z.string().max(200).optional(), tag: z.string().max(50).optional() }).optional(),
      tag: z.string().trim().min(1).max(50).optional(),
      expectedCount: z.number().int().min(1).optional(),
    }),
  );
  const ctx = await requireCtx(b.action === "delete" ? "admin" : "user");
  const loc = ctx.location.id;
  if (!b.ids && !b.filter) throw new HttpError(400, "Choose contacts first");
  const ids = b.filter ? matchingContactIds(loc, b.filter) : [...new Set(b.ids)].filter((id) => getContact(id)?.location_id === loc);
  if (!ids.length) throw new HttpError(400, "No matching contacts");

  if (b.action === "delete") {
    if (b.expectedCount === undefined || b.expectedCount !== ids.length) {
      throw new HttpError(409, `The selection now matches ${ids.length} contact(s) — please review and confirm again`);
    }
    return NextResponse.json({ ok: true, count: bulkDeleteContacts(loc, ids) });
  }
  if (!b.tag) throw new HttpError(400, "Enter a tag");
  for (const id of ids) {
    if (b.action === "add_tag") addTag(loc, id, b.tag, { userId: ctx.user.id });
    else removeTag(loc, id, b.tag, { userId: ctx.user.id });
  }
  return NextResponse.json({ ok: true, count: ids.length });
});
