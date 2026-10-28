import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, LlmProvider } from "./types";
import { collect, normalizeError } from "./util";

/** Minimal surface of the SDK we use — lets tests inject a fake client. */
export interface AnthropicLike {
  messages: { create(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): unknown };
}

export function anthropicProvider(opts: { apiKey: string; model: string; client?: AnthropicLike }): LlmProvider {
  const client: AnthropicLike = opts.client ?? (new Anthropic({ apiKey: opts.apiKey }) as unknown as AnthropicLike);

  async function* stream(req: CompletionRequest): AsyncIterable<string> {
    const params: Record<string, unknown> = {
      model: req.model || opts.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (req.temperature != null) params.temperature = req.temperature;

    try {
      const events = (await client.messages.create(params, { signal: req.signal })) as AsyncIterable<{
        type: string;
        delta?: { type?: string; text?: string };
        error?: { message?: string };
      }>;
      for await (const ev of events) {
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) yield ev.delta.text;
        else if (ev.type === "error") throw new Error(ev.error?.message || "Stream error");
      }
    } catch (err) {
      throw normalizeError("Anthropic", err);
    }
  }

  return {
    name: "anthropic",
    model: opts.model,
    stream,
    complete: (req) => collect(stream(req)),
  };
}
