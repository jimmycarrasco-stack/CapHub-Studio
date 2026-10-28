import { describe, expect, it, vi } from "vitest";
import type { LlmProvider, StepRequest, StepResult } from "@/lib/llm/types";

/** AI Guide tool loop with a scripted fake provider (no network). */

async function setup() {
  vi.resetModules();
  (globalThis as { __caphubDb?: unknown }).__caphubDb = undefined;
  (globalThis as { __caphubEventHandlers?: unknown }).__caphubEventHandlers = undefined;
  process.env.DATABASE_PATH = ":memory:";
  process.env.APP_SECRET = "s".repeat(40);
  const auth = await import("@/lib/auth");
  const guide = await import("@/lib/crm/guide");
  const contacts = await import("@/lib/crm/contacts");
  const automations = await import("@/lib/crm/automations");
  const pipelines = await import("@/lib/crm/pipelines");
  const loc = auth.createLocation({ name: "Acme" });
  const other = auth.createLocation({ name: "Other" });
  const user = await auth.createUser({ email: "a@acme.test", name: "Ana", password: "x".repeat(12) });
  auth.setMembership(user.id, loc.id, "user");
  const ctx = { user, location: loc, role: "user" as const, isAgencyAdmin: false };
  return { guide, contacts, automations, pipelines, loc, other, ctx };
}

/** A provider that replays scripted steps and records what it was sent. */
function scripted(steps: Omit<StepResult, "raw" | "usage">[]) {
  const seen: StepRequest[] = [];
  let i = 0;
  const provider: LlmProvider = {
    name: "anthropic",
    model: "fake",
    stream: async function* () {},
    complete: async () => "",
    step: async (req) => {
      seen.push(structuredClone({ ...req, signal: undefined, onText: undefined }));
      const s = steps[Math.min(i++, steps.length - 1)];
      if (s.text) req.onText?.(s.text);
      return { ...s, raw: null, usage: { input: 0, output: 0 } };
    },
  };
  return { provider, seen };
}

describe("AI guide", () => {
  it("exposes valid JSON-schema tools including the automation schema", async () => {
    const { guide } = await setup();
    const names = guide.GUIDE_TOOLS.map((t) => t.name);
    expect(names).toContain("create_automation");
    for (const t of guide.GUIDE_TOOLS) expect(t.parameters.type).toBe("object");
    expect(JSON.stringify(guide.GUIDE_TOOLS.find((t) => t.name === "create_automation")!.parameters)).toContain("tag_added");
  });

  it("runs tools, reports actions, and creates automations switched off", async () => {
    const { guide, contacts, automations, loc, ctx } = await setup();
    const { provider, seen } = scripted([
      {
        text: "On it.",
        stop: "tool_use",
        toolCalls: [
          { id: "1", name: "create_contact", input: { first_name: "Bo", email: "bo@x.com", tags: ["lead"] } },
          {
            id: "2",
            name: "create_automation",
            input: { name: "Welcome", trigger: { type: "tag_added", tag: "lead" }, steps: [{ type: "add_tag", tag: "welcomed" }] },
          },
          { id: "3", name: "navigate", input: { path: "//evil.com" } },
        ],
      },
      { text: "Done!", stop: "end", toolCalls: [] },
    ]);
    const events: { type: string }[] = [];
    await guide.runGuide(ctx, [{ role: "user", content: "set me up" }], "/", (e) => events.push(e), new AbortController().signal, provider);

    expect(contacts.listContacts(loc.id).total).toBe(1);
    const list = automations.listAutomations(loc.id);
    expect(list).toHaveLength(1);
    expect(list[0].enabled).toBe(false);
    const done = events.find((e) => e.type === "done") as unknown as { actions: string[] };
    expect(done.actions).toHaveLength(2);
    // The off-site navigation was refused and reported back to the model as an error.
    const toolMsg = seen[1].messages.find((m) => m.role === "tool") as { results: { id: string; isError?: boolean }[] };
    expect(toolMsg.results.find((r) => r.id === "3")?.isError).toBe(true);
    expect(events.some((e) => e.type === "navigate")).toBe(false);
    // System prompt carries the account overview.
    expect(seen[0].system).toContain("Acme");
  });

  it("can't touch another sub-account's records", async () => {
    const { guide, contacts, pipelines, other, ctx } = await setup();
    const foreign = contacts.createContact(other.id, { email: "x@other.com" });
    const p = pipelines.createPipeline(other.id, "Theirs");
    const { provider, seen } = scripted([
      {
        text: "",
        stop: "tool_use",
        toolCalls: [
          { id: "a", name: "update_tags", input: { contact_id: foreign.id, add: ["pwned"] } },
          { id: "b", name: "create_deal", input: { pipeline_id: p.id, title: "x" } },
        ],
      },
      { text: "ok", stop: "end", toolCalls: [] },
    ]);
    await guide.runGuide(ctx, [{ role: "user", content: "go" }], "/", () => {}, new AbortController().signal, provider);
    const toolMsg = seen[1].messages.find((m) => m.role === "tool") as { results: { isError?: boolean }[] };
    expect(toolMsg.results.every((r) => r.isError)).toBe(true);
    expect(contacts.getContact(foreign.id)!.tags).toEqual([]);
    expect(pipelines.listOpportunities(p.id)).toHaveLength(0);
  });
});
