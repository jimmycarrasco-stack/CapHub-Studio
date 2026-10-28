import Anthropic from "@anthropic-ai/sdk";
import type { AgentMessage, CompletionRequest, LlmProvider, StepRequest, StepResult, ToolCall } from "./types";
import { collect, normalizeError, parseToolInput } from "./util";

/** Minimal surface of the SDK we use — lets tests inject a fake client. */
export interface AnthropicLike {
  messages: { create(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): unknown };
}

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };
type StreamEvent = {
  type: string;
  index?: number;
  content_block?: Block;
  delta?: { type?: string; text?: string; partial_json?: string; thinking?: string; signature?: string; stop_reason?: string };
  message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
  usage?: { output_tokens?: number };
  error?: { message?: string };
};

/** Converts neutral agent messages to Anthropic messages, with a cache breakpoint on the newest block. */
export function toAnthropicMessages(messages: AgentMessage[]) {
  const out: { role: "user" | "assistant"; content: unknown }[] = messages.map((m) => {
    if (m.role === "user") return { role: "user", content: [{ type: "text", text: m.content }] };
    if (m.role === "assistant") return { role: "assistant", content: m.raw ?? [{ type: "text", text: m.text || "(no reply)" }] };
    return {
      role: "user",
      content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.output || "(no output)", is_error: !!r.isError })),
    };
  });
  // Prompt caching: everything up to the latest user/tool message is re-read from cache on the next step.
  const last = out[out.length - 1];
  if (last && last.role === "user" && Array.isArray(last.content) && last.content.length) {
    const blocks = last.content as Record<string, unknown>[];
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
  }
  return out;
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
      const events = (await client.messages.create(params, { signal: req.signal })) as AsyncIterable<StreamEvent>;
      for await (const ev of events) {
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) yield ev.delta.text;
        else if (ev.type === "error") throw new Error(ev.error?.message || "Stream error");
      }
    } catch (err) {
      throw normalizeError("Anthropic", err);
    }
  }

  async function step(req: StepRequest): Promise<StepResult> {
    const params: Record<string, unknown> = {
      model: req.model || opts.model,
      max_tokens: req.maxTokens,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: toAnthropicMessages(req.messages),
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      stream: true,
    };

    const blocks: Block[] = [];
    const json: string[] = [];
    let stopReason = "end_turn";
    const usage = { input: 0, output: 0 };

    try {
      const events = (await client.messages.create(params, { signal: req.signal })) as AsyncIterable<StreamEvent>;
      for await (const ev of events) {
        const i = ev.index ?? 0;
        switch (ev.type) {
          case "message_start": {
            const u = ev.message?.usage;
            usage.input = (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
            break;
          }
          case "content_block_start":
            blocks[i] = { ...(ev.content_block as Block) };
            json[i] = "";
            break;
          case "content_block_delta": {
            const b = blocks[i];
            const d = ev.delta ?? {};
            if (d.type === "text_delta" && d.text) {
              b.text = (b.text ?? "") + d.text;
              req.onText?.(d.text);
            } else if (d.type === "input_json_delta") json[i] += d.partial_json ?? "";
            else if (d.type === "thinking_delta") b.thinking = String(b.thinking ?? "") + (d.thinking ?? "");
            else if (d.type === "signature_delta") b.signature = d.signature;
            break;
          }
          case "content_block_stop": {
            const b = blocks[i];
            if (b?.type === "tool_use") b.input = json[i] ? (parseToolInput(json[i]) ?? { __unparsed: json[i] }) : {};
            break;
          }
          case "message_delta":
            if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
            usage.output = ev.usage?.output_tokens ?? usage.output;
            break;
          case "error":
            throw new Error(ev.error?.message || "Stream error");
        }
      }
    } catch (err) {
      throw normalizeError("Anthropic", err);
    }

    const content = blocks.filter(Boolean);
    const toolCalls: ToolCall[] = content
      .filter((b) => b.type === "tool_use")
      .map((b) => {
        const input = b.input as Record<string, unknown>;
        return { id: String(b.id), name: String(b.name), input: input && "__unparsed" in input ? null : input };
      });
    // An unparsable tool input can't be replayed to the API; store it as an empty object.
    const raw = content.map((b) => (b.type === "tool_use" && b.input && typeof b.input === "object" && "__unparsed" in b.input ? { ...b, input: {} } : b));

    return {
      text: content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
      toolCalls,
      raw,
      stop: stopReason === "max_tokens" ? "max_tokens" : toolCalls.length ? "tool_use" : "end",
      usage,
    };
  }

  return {
    name: "anthropic",
    model: opts.model,
    stream,
    complete: (req) => collect(stream(req)),
    step,
  };
}
