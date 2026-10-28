import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, corsPreflight, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { addSubmission, getSite } from "@/lib/repo";

const schema = z.object({
  form: z.string().max(100).default("form"),
  page: z.string().max(2000).default(""),
  data: z.record(z.string().max(100), z.string().max(10_000)).refine((d) => Object.keys(d).length <= 50, "Too many fields"),
});

export const OPTIONS = corsPreflight;

/** Receives submissions from forms on published pages (called by /caphub-runtime.js). */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ siteId: string }> }) => {
    const { siteId } = await ctx.params;
    rateLimit(`form:${clientIp(req)}`, 20, 60_000);
    const site = getSite(siteId);
    if (!site || !site.published) throw new HttpError(404, "Site not found");
    const body = await parseBody(req, schema);
    // Honeypot: the runtime adds a hidden `_hp` field; bots tend to fill it.
    if (body.data._hp) return NextResponse.json({ ok: true });
    delete body.data._hp;
    addSubmission(site.id, body.form, body.data, body.page);
    return NextResponse.json({ ok: true });
  },
  { cors: true },
);
