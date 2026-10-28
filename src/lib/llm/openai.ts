import OpenAI from "openai";
import type { CompletionRequest, LlmProvider } from "./types";
import { collect, normalizeError } from "./util";

/** Minimal surface of the SDK we use — lets tests inject a fake client. */
export interface OpenAILike {
  responses: { create(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): unknown };
}

/** Uses the Responses API (OpenAI's recommended API for new projects). */
export function openaiProvider(opts: { apiKey: string; model: string; client?: OpenAILike }): LlmProvider {
  const client: OpenAILike = opts.client ?? (new OpenAI({ apiKey: opts.apiKey }) as unknown as OpenAILike);

  async function* stream(req: CompletionRequest): AsyncIterable<string> {
    const params: Record<string, unknown> = {
      model: req.model || opts.model,
      instructions: req.system,
      input: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: req.maxTokens,
      stream: true,
      store: false,
    };
    if (req.temperature != null) params.temperature = req.temperature;

    try {
      const events = (await client.responses.create(params, { signal: req.signal })) as AsyncIterable<{
        type: string;
        delta?: string;
        message?: string;
        response?: { error?: { message?: string } | null };
      }>;
      for await (const ev of events) {
        if (ev.type === "response.output_text.delta" && ev.delta) yield ev.delta;
        else if (ev.type === "error") throw new Error(ev.message || "Stream error");
        else if (ev.type === "response.failed") throw new Error(ev.response?.error?.message || "Response failed");
      }
    } catch (err) {
      throw normalizeError("OpenAI", err);
    }
  }

  return {
    name: "openai",
    model: opts.model,
    stream,
    complete: (req) => collect(stream(req)),
  };
}
