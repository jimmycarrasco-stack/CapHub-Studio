import { describe, expect, it } from "vitest";
import { anthropicProvider } from "@/lib/llm/anthropic";
import { openaiProvider } from "@/lib/llm/openai";

async function* events<T>(list: T[]) {
  for (const e of list) yield e;
}

describe("anthropic provider", () => {
  it("maps request params and streams text deltas", async () => {
    let seen: Record<string, unknown> = {};
    const client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          seen = params;
          return events([
            { type: "message_start" },
            { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
            { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
            { type: "message_stop" },
          ]);
        },
      },
    };
    const p = anthropicProvider({ apiKey: "k", model: "claude-test", client });
    const out = await p.complete({ system: "sys", messages: [{ role: "user", content: "hi" }], maxTokens: 50 });
    expect(out).toBe("Hello");
    expect(seen).toMatchObject({ model: "claude-test", system: "sys", max_tokens: 50, stream: true });
    expect(seen).not.toHaveProperty("temperature");
  });

  it("passes temperature and model override when given", async () => {
    let seen: Record<string, unknown> = {};
    const client = { messages: { create: async (p: Record<string, unknown>) => ((seen = p), events([])) } };
    await anthropicProvider({ apiKey: "k", model: "a", client }).complete({ system: "", messages: [], maxTokens: 1, temperature: 0.3, model: "b" });
    expect(seen).toMatchObject({ model: "b", temperature: 0.3 });
  });

  it("turns auth errors into a readable message", async () => {
    const client = {
      messages: {
        create: async () => {
          throw Object.assign(new Error("invalid x-api-key"), { status: 401 });
        },
      },
    };
    await expect(anthropicProvider({ apiKey: "bad", model: "a", client }).complete({ system: "", messages: [], maxTokens: 1 })).rejects.toThrow(
      /Anthropic error \(401\).*API key was rejected/,
    );
  });
});

describe("openai provider", () => {
  it("uses the Responses API shape and streams output_text deltas", async () => {
    let seen: Record<string, unknown> = {};
    const client = {
      responses: {
        create: async (params: Record<string, unknown>) => {
          seen = params;
          return events([
            { type: "response.created" },
            { type: "response.output_text.delta", delta: "Hi " },
            { type: "response.output_text.delta", delta: "there" },
            { type: "response.completed" },
          ]);
        },
      },
    };
    const p = openaiProvider({ apiKey: "k", model: "gpt-test", client });
    expect(await p.complete({ system: "sys", messages: [{ role: "user", content: "yo" }], maxTokens: 99 })).toBe("Hi there");
    expect(seen).toMatchObject({ model: "gpt-test", instructions: "sys", max_output_tokens: 99, stream: true, store: false });
    expect(seen.input).toEqual([{ role: "user", content: "yo" }]);
  });

  it("surfaces failed responses", async () => {
    const client = { responses: { create: async () => events([{ type: "response.failed", response: { error: { message: "boom" } } }]) } };
    await expect(openaiProvider({ apiKey: "k", model: "m", client }).complete({ system: "", messages: [], maxTokens: 1 })).rejects.toThrow(/OpenAI error: boom/);
  });
});
