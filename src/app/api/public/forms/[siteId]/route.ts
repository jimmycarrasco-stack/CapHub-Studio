import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, corsPreflight, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { db } from "@/lib/db";
import { addActivity, upsertContact } from "@/lib/crm/contacts";
import { emitEvent } from "@/lib/crm/events";
import { siteIsLive } from "@/lib/crm/public-pages";
import { addSubmission, getSite } from "@/lib/repo";
import { contactFromForm } from "@/lib/site-builder";

const schema = z.object({
  form: z.string().max(100).default("form"),
  page: z.string().max(2000).default(""),
  data: z.record(z.string().max(100), z.string().max(10_000)).refine((d) => Object.keys(d).length <= 50, "Too many fields"),
});

export const OPTIONS = corsPreflight;

/**
 * Receives submissions from forms on published pages and funnel steps (called by /caphub-runtime.js).
 * Creates or updates a CRM contact (when there's an email or phone), tags it, logs the submission on
 * the contact and fires the "Form submitted" automation trigger.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ siteId: string }> }) => {
    const { siteId } = await ctx.params;
    rateLimit(`form:${clientIp(req)}`, 20, 60_000);
    const site = getSite(siteId);
    if (!site || !siteIsLive(site.id)) throw new HttpError(404, "Site not found");
    const body = await parseBody(req, schema);
    // Honeypot: the runtime adds a hidden `_hp` field; bots tend to fill it.
    if (body.data._hp) return NextResponse.json({ ok: true });
    delete body.data._hp;

    let contactId: string | null = null;
    const fields = contactFromForm(body.data);
    if (site.location_id && (fields.email || fields.phone)) {
      const { contact } = upsertContact(site.location_id, {
        ...fields,
        email: fields.email || null,
        phone: fields.phone || null,
        source: `form: ${site.name}`,
        tags: [body.form && body.form !== "form" ? body.form : "website lead"],
      });
      contactId = contact.id;
      const summary = Object.entries(body.data)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
        .slice(0, 1800);
      addActivity(site.location_id, contactId, "form", `Submitted “${body.form}” on ${site.name}\n${summary}`, { siteId: site.id });
    }
    addSubmission(site.id, body.form, body.data, body.page);
    if (contactId) {
      db().prepare("UPDATE form_submissions SET contact_id = ? WHERE id = (SELECT MAX(id) FROM form_submissions WHERE site_id = ?)").run(contactId, site.id);
      emitEvent(site.location_id!, { type: "form_submitted", contactId, data: { siteId: site.id, formName: body.form, fields: body.data } });
    }
    return NextResponse.json({ ok: true, contactId: contactId ? true : false });
  },
  { cors: true },
);
