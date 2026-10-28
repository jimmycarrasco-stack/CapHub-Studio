import OpenAI from "openai";
import type { AgentMessage, CompletionRequest, LlmProvider, StepRequest, StepResult, ToolCall } from "./types";
import { collect, normalizeError, parseToolInput } from "./util";

/** Minimal surface of the SDK we use — lets tests inject a fake client. */
export interface OpenAILike {
  responses: { create(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): unknown };
}

type OutputItem = { type: string; call_id?: string; name?: string; arguments?: string; content?: { type: string; text?: string }[]; [k: string]: unknown };
type StreamEvent = {
  type: string;
  delta?: string;
  message?: string;
  response?: {
    status?: string;
    output?: OutputItem[];
    error?: { message?: string } | null;
    incomplete_details?: { reason?: string } | null;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
};

/** Converts neutral agent messages to Responses API input items. */
export function toOpenAIInput(messages: AgentMessage[]) {
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === "user") input.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      // Replayed history without provider-native output falls back to plain text.
      if (m.raw) input.push(...(m.raw as unknown[]));
      else input.push({ role: "assistant", content: m.text || "(no reply)" });
    }
    else for (const r of m.results) input.push({ type: "function_call_output", call_id: r.id, output: r.isError ? `ERROR: ${r.output}` : r.output || "(no output)" });
  }
  return input;
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
      const events = (await client.responses.create(params, { signal: req.signal })) as AsyncIterable<StreamEvent>;
      for await (const ev of events) {
        if (ev.type === "response.output_text.delta" && ev.delta) yield ev.delta;
        else if (ev.type === "error") throw new Error(ev.message || "Stream error");
        else if (ev.type === "response.failed") throw new Error(ev.response?.error?.message || "Response failed");
      }
    } catch (err) {
      throw normalizeError("OpenAI", err);
    }
  }

  async function step(req: StepRequest): Promise<StepResult> {
    const params: Record<string, unknown> = {
      model: req.model || opts.model,
      instructions: req.system,
      input: toOpenAIInput(req.messages),
      tools: req.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false })),
      max_output_tokens: req.maxTokens,
      stream: true,
      // Stateless: nothing stored at OpenAI. Reasoning is carried between steps as encrypted items.
      store: false,
      include: ["reasoning.encrypted_content"],
    };

    let final: StreamEvent["response"] | undefined;
    try {
      const events = (await client.responses.create(params, { signal: req.signal })) as AsyncIterable<StreamEvent>;
      for await (const ev of events) {
        if (ev.type === "response.output_text.delta" && ev.delta) req.onText?.(ev.delta);
        else if (ev.type === "response.completed" || ev.type === "response.incomplete") final = ev.response;
        else if (ev.type === "error") throw new Error(ev.message || "Stream error");
        else if (ev.type === "response.failed") throw new Error(ev.response?.error?.message || "Response failed");
      }
    } catch (err) {
      throw normalizeError("OpenAI", err);
    }
    if (!final) throw normalizeError("OpenAI", new Error("Stream ended without a response"));

    const output = final.output ?? [];
    const toolCalls: ToolCall[] = output
      .filter((o) => o.type === "function_call")
      .map((o) => ({ id: String(o.call_id), name: String(o.name), input: parseToolInput(o.arguments ?? "{}") }));
    const text = output
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    const cutOff = final.status === "incomplete" && final.incomplete_details?.reason === "max_output_tokens";

    return {
      text,
      toolCalls,
      raw: output,
      stop: cutOff ? "max_tokens" : toolCalls.length ? "tool_use" : "end",
      usage: { input: final.usage?.input_tokens ?? 0, output: final.usage?.output_tokens ?? 0 },
    };
  }

  return {
    name: "openai",
    model: opts.model,
    stream,
    complete: (req) => collect(stream(req)),
    step,
  };
}
