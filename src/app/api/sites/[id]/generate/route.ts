import { z } from "zod";
import { siteFor } from "@/lib/guards";
import { handle, HttpError, parseBody } from "@/lib/http";
import { getProvider } from "@/lib/llm";
import { addSiteMessage, getSite, listSiteMessages, saveSiteHtml } from "@/lib/repo";
import { buildGenerateMessages, parseSiteResponse, SITE_SYSTEM_PROMPT } from "@/lib/site-builder";
import { formatMoney, listProducts } from "@/lib/crm/payments";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 300;

/**
 * Generates or edits the page from a prompt. Streams NDJSON events:
 *   {"type":"delta","text":"..."}            raw model text as it arrives
 *   {"type":"done","html","summary","versionId"}
 *   {"type":"error","message"}
 * Errors before streaming starts (auth, missing API key) return normal JSON errors.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { site } = await siteFor(id);
  const { prompt } = await parseBody(req, z.object({ prompt: z.string().trim().min(1).max(20_000) }));

  const provider = getProvider("default");
  const products = site.location_id
    ? listProducts(site.location_id, { activeOnly: true }).map((p) => ({
        id: p.id,
        name: p.name,
        price: `${formatMoney(p.price_cents, p.currency)}${p.interval ? ` / ${p.interval}` : ""}`,
      }))
    : [];
  const messages = buildGenerateMessages({ instruction: prompt, currentHtml: site.html, history: listSiteMessages(site.id), products });
  addSiteMessage(site.id, "user", prompt);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let text = "";
      try {
        for await (const delta of provider.stream({ system: SITE_SYSTEM_PROMPT, messages, maxTokens: 32_000, signal: req.signal })) {
          text += delta;
          send({ type: "delta", text: delta });
        }
        const { html, summary } = parseSiteResponse(text);
        if (!html) throw new Error("The model didn't return an HTML document. Try rephrasing your request.");
        const versionId = saveSiteHtml(site.id, html, summary);
        addSiteMessage(site.id, "assistant", summary);
        send({ type: "done", html, summary, versionId, provider: provider.name, model: provider.model });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        if (!req.signal.aborted) {
          addSiteMessage(site.id, "assistant", `⚠️ ${message}`);
          send({ type: "error", message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* client disconnected */
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
