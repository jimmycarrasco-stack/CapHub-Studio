import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, handle, HttpError, rateLimit } from "@/lib/http";
import { enroll, getAutomation } from "@/lib/crm/automations";
import { upsertContact } from "@/lib/crm/contacts";
import { contactFromForm } from "@/lib/site-builder";

/**
 * Inbound webhook trigger: POST JSON to /api/hooks/<automationId>?key=<secret>.
 * Fields like email, first_name/name, phone, company create or update the contact;
 * a `tags` array/comma list is applied; everything is available to the automation.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ automationId: string }> }) => {
  rateLimit(`hook:${clientIp(req)}`, 60, 60_000);
  const a = getAutomation((await ctx.params).automationId);
  const key = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-caphub-key") ?? "";
  const ok = a && key.length === a.hook_secret.length && timingSafeEqual(Buffer.from(key), Buffer.from(a.hook_secret));
  if (!a || !ok) throw new HttpError(404, "Not found");
  if (a.trigger.type !== "webhook") throw new HttpError(409, "This automation isn't triggered by a webhook");
  if (!a.enabled) throw new HttpError(409, "This automation is turned off");

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  const flat = Object.fromEntries(Object.entries(payload).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]));
  const fields = contactFromForm(flat);
  if (!fields.email && !fields.phone) throw new HttpError(400, "Include at least an email or phone");
  const tags = Array.isArray(payload.tags) ? payload.tags.map(String) : typeof payload.tags === "string" ? payload.tags.split(",") : [];
  const { contact, created } = upsertContact(a.location_id, { ...fields, email: fields.email || null, phone: fields.phone || null, source: "webhook", tags });
  const runId = enroll(a, contact.id, { type: "webhook", contactId: contact.id, data: { automationId: a.id, payload } });
  return NextResponse.json({ ok: true, contactId: contact.id, created, enrolled: runId !== null });
});
