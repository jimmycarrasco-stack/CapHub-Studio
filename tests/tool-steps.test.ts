import { describe, expect, it } from "vitest";
import { anthropicProvider, toAnthropicMessages } from "@/lib/llm/anthropic";
import { openaiProvider, toOpenAIInput } from "@/lib/llm/openai";
import type { AgentMessage, ToolDef } from "@/lib/llm/types";

async function* events<T>(list: T[]) {
  for (const e of list) yield e;
}

const tools: ToolDef[] = [{ name: "read_file", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } }];

describe("anthropic step", () => {
  it("assembles text + tool_use from the stream and maps tools", async () => {
    let seen: Record<string, unknown> = {};
    const deltas: string[] = [];
    const client = {
      messages: {
        create: async (p: Record<string, unknown>) => {
          seen = p;
          return events([
            { type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 90 } } },
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me look." } },
            { type: "content_block_stop", index: 0 },
            { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "read_file", input: {} } },
            { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"pa' } },
            { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'th":"a.ts"}' } },
            { type: "content_block_stop", index: 1 },
            { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } },
          ]);
        },
      },
    };
    const p = anthropicProvider({ apiKey: "k", model: "m", client });
    const r = await p.step({ system: "sys", messages: [{ role: "user", content: "hi" }], tools, maxTokens: 100, onText: (d) => deltas.push(d) });
    expect(r.text).toBe("Let me look.");
    expect(r.toolCalls).toEqual([{ id: "tu_1", name: "read_file", input: { path: "a.ts" } }]);
    expect(r.stop).toBe("tool_use");
    expect(r.usage).toEqual({ input: 100, output: 20 });
    expect(deltas).toEqual(["Let me look."]);
    expect(seen.tools).toEqual([{ name: "read_file", description: "Read", input_schema: tools[0].parameters }]);
    expect((seen.system as { cache_control: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("marks cut-off tool input as unparsed (null) and stop=max_tokens", async () => {
    const client = {
      messages: {
        create: async () =>
          events([
            { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t", name: "write_file", input: {} } },
            { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":"a","content":"abc' } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "max_tokens" } },
          ]),
      },
    };
    const r = await anthropicProvider({ apiKey: "k", model: "m", client }).step({ system: "", messages: [], tools, maxTokens: 1 });
    expect(r.stop).toBe("max_tokens");
    expect(r.toolCalls[0].input).toBeNull();
    expect((r.raw as { input: unknown }[])[0].input).toEqual({}); // replayable
  });

  it("maps tool results and caches the newest block", () => {
    const msgs: AgentMessage[] = [
      { role: "user", content: "go" },
      { role: "assistant", text: "", toolCalls: [], raw: [{ type: "tool_use", id: "t1", name: "x", input: {} }] },
      { role: "tool", results: [{ id: "t1", output: "done" }, { id: "t2", output: "bad", isError: true }] },
    ];
    const out = toAnthropicMessages(msgs);
    expect(out[1]).toEqual({ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "x", input: {} }] });
    const blocks = out[2].content as Record<string, unknown>[];
    expect(blocks[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "done", is_error: false });
    expect(blocks[1]).toMatchObject({ tool_use_id: "t2", is_error: true, cache_control: { type: "ephemeral" } });
    expect(blocks[0]).not.toHaveProperty("cache_control");
  });
});

describe("openai step", () => {
  it("reads function calls and text from response.completed", async () => {
    let seen: Record<string, unknown> = {};
    const client = {
      responses: {
        create: async (p: Record<string, unknown>) => {
          seen = p;
          return events([
            { type: "response.output_text.delta", delta: "Checking" },
            {
              type: "response.completed",
              response: {
                status: "completed",
                usage: { input_tokens: 50, output_tokens: 5 },
                output: [
                  { type: "reasoning", id: "rs_1", encrypted_content: "xyz" },
                  { type: "message", content: [{ type: "output_text", text: "Checking" }] },
                  { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"b.ts"}' },
                ],
              },
            },
          ]);
        },
      },
    };
    const r = await openaiProvider({ apiKey: "k", model: "gpt", client }).step({ system: "sys", messages: [{ role: "user", content: "x" }], tools, maxTokens: 10 });
    expect(r.text).toBe("Checking");
    expect(r.toolCalls).toEqual([{ id: "c1", name: "read_file", input: { path: "b.ts" } }]);
    expect(r.stop).toBe("tool_use");
    expect((r.raw as unknown[]).length).toBe(3);
    expect(seen).toMatchObject({ store: false, include: ["reasoning.encrypted_content"], instructions: "sys" });
    expect((seen.tools as unknown[])[0]).toMatchObject({ type: "function", name: "read_file", strict: false });
  });

  it("detects max_output_tokens cut-off", async () => {
    const client = {
      responses: {
        create: async () =>
          events([{ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } }]),
      },
    };
    expect((await openaiProvider({ apiKey: "k", model: "m", client }).step({ system: "", messages: [], tools, maxTokens: 1 })).stop).toBe("max_tokens");
  });

  it("replays raw output items and maps tool results", () => {
    const input = toOpenAIInput([
      { role: "user", content: "go" },
      { role: "assistant", text: "", toolCalls: [], raw: [{ type: "function_call", call_id: "c1", name: "x", arguments: "{}" }] },
      { role: "tool", results: [{ id: "c1", output: "ok" }, { id: "c2", output: "boom", isError: true }] },
    ]);
    expect(input).toEqual([
      { role: "user", content: "go" },
      { type: "function_call", call_id: "c1", name: "x", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "ok" },
      { type: "function_call_output", call_id: "c2", output: "ERROR: boom" },
    ]);
  });
});
