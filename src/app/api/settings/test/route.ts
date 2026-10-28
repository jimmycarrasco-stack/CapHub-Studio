import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { getProvider } from "@/lib/llm";
import { PROVIDERS } from "@/lib/llm/catalog";

/** Sends a tiny request to verify the key + model for a provider. */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { provider } = await parseBody(req, z.object({ provider: z.enum(PROVIDERS) }));
  const p = getProvider(provider);
  const started = Date.now();
  const reply = await p.complete({
    system: "You are a connectivity check. Reply with the single word: OK",
    messages: [{ role: "user", content: "Ping" }],
    maxTokens: 256, // headroom for reasoning models that think before answering
  });
  return NextResponse.json({ ok: true, provider: p.name, model: p.model, reply: reply.trim().slice(0, 50), ms: Date.now() - started });
});
