import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { runGuide, type GuideEvent } from "@/lib/crm/guide";
import { handle, parseBody, rateLimit } from "@/lib/http";

export const maxDuration = 300;

/** One guide turn, streamed as NDJSON events. History is kept by the client. */
export const POST = handle(async (req: Request) => {
  const ctx = await requireCtx();
  rateLimit(`guide:${ctx.user.id}`, 30, 60_000);
  const body = await parseBody(
    req,
    z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20_000) })).min(1).max(40),
      page: z.string().max(300).default("/"),
    }),
  );
  if (body.messages.at(-1)!.role !== "user") body.messages.push({ role: "user", content: "Continue." });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: GuideEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client went away */
        }
      };
      try {
        await runGuide(ctx, body.messages, body.page, emit, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) emit({ type: "error", error: (err as Error).message || "The guide hit an error" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
