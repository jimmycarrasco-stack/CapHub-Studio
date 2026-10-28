import { beforeEach, describe, expect, it, vi } from "vitest";

/** CRM data layer + automation engine against an in-memory SQLite database. */

async function setup() {
  vi.resetModules();
  (globalThis as { __caphubDb?: unknown }).__caphubDb = undefined;
  (globalThis as { __caphubEventHandlers?: unknown }).__caphubEventHandlers = undefined;
  process.env.DATABASE_PATH = ":memory:";
  process.env.APP_SECRET = "s".repeat(40);
  const auth = await import("@/lib/auth");
  const contacts = await import("@/lib/crm/contacts");
  const pipelines = await import("@/lib/crm/pipelines");
  const automations = await import("@/lib/crm/automations");
  const email = await import("@/lib/crm/email");
  const loc = auth.createLocation({ name: "Acme Roofing", email: "team@acme.test" });
  const other = auth.createLocation({ name: "Other Co" });
  return { auth, contacts, pipelines, automations, email, loc, other };
}

const flush = async (automations: { processDueRuns: () => Promise<void> }) => {
  await new Promise((r) => setTimeout(r, 30));
  await automations.processDueRuns();
};

beforeEach(() => {
  vi.useRealTimers();
});

describe("contacts", () => {
  it("creates, dedupes by email, searches, tags and scopes by sub-account", async () => {
    const { contacts, loc, other } = await setup();
    const c = contacts.createContact(loc.id, { first_name: "Ana", last_name: "Silva", email: "ANA@x.com", tags: ["lead"] });
    expect(c.email).toBe("ana@x.com");
    expect(c.tags).toEqual(["lead"]);
    expect(() => contacts.createContact(loc.id, { email: "ana@x.com" })).toThrow(/already exists/);
    contacts.createContact(other.id, { email: "ana@x.com" }); // same email allowed in another sub-account
    contacts.createContact(loc.id, { first_name: "Bob", phone: "204-555-0100" });
    expect(contacts.listContacts(loc.id).total).toBe(2);
    expect(contacts.listContacts(loc.id, { q: "silv" }).contacts.map((x) => x.first_name)).toEqual(["Ana"]);
    expect(contacts.listContacts(loc.id, { q: "%" }).total).toBe(0); // LIKE wildcards are escaped
    expect(contacts.listContacts(loc.id, { tag: "lead" }).total).toBe(1);
    expect(() => contacts.createContact(loc.id, {})).toThrow(/at least/);
  });

  it("upsert fills missing fields without overwriting", async () => {
    const { contacts, loc } = await setup();
    contacts.createContact(loc.id, { first_name: "Ana", email: "ana@x.com" });
    const { contact, created } = contacts.upsertContact(loc.id, { email: "ana@x.com", first_name: "Anna", phone: "555", source: "form", tags: ["web"] });
    expect(created).toBe(false);
    expect(contact.first_name).toBe("Ana");
    expect(contact.phone).toBe("555");
    expect(contact.tags).toEqual(["web"]);
  });
});

describe("pipelines", () => {
  it("creates deals, moves stages, and refuses to delete non-empty stages", async () => {
    const { contacts, pipelines, loc, other } = await setup();
    const p = pipelines.createPipeline(loc.id, "Sales");
    expect(p.stages.map((s) => s.name)).toEqual(pipelines.DEFAULT_STAGES);
    const c = contacts.createContact(loc.id, { email: "a@x.com" });
    const o = pipelines.createOpportunity(loc.id, { pipelineId: p.id, title: "Roof", valueCents: 500000, contactId: c.id });
    expect(o.stage_id).toBe(p.stages[0].id);
    pipelines.updateOpportunity(o.id, { stageId: p.stages[2].id });
    expect(() => pipelines.updateOpportunity(o.id, { stageId: "nope" })).toThrow(/stage/);
    expect(() => pipelines.createOpportunity(other.id, { pipelineId: p.id, title: "x" })).toThrow(/not found/);
    expect(() => pipelines.updatePipeline(p.id, { stages: [{ id: p.stages[0].id, name: "Only" }] })).toThrow(/Move the 1 deal/);
    const updated = pipelines.updatePipeline(p.id, { name: "Roofing", stages: [...p.stages.map((s) => ({ id: s.id, name: s.name })), { name: "Lost" }] });
    expect(updated.stages.length).toBe(6);
    expect(pipelines.pipelineStats(loc.id)).toMatchObject({ open_count: 1, open_value: 500000 });
  });
});

describe("automations", () => {
  it("runs on tag added: tags, creates a deal and a task, logs failed email without stopping", async () => {
    const { contacts, pipelines, automations, loc } = await setup();
    const p = pipelines.createPipeline(loc.id, "Sales");
    const a = automations.createAutomation(loc.id, {
      name: "Hot lead",
      enabled: true,
      trigger: { type: "tag_added", tag: "hot" },
      steps: [
        { type: "send_email", subject: "Hi {{contact.first_name}}", body: "Thanks!" },
        { type: "add_tag", tag: "nurtured" },
        { type: "create_opportunity", pipelineId: p.id, title: "{{contact.name}}", valueCents: 1000 },
        { type: "create_task", title: "Call {{contact.first_name}}", dueInDays: 1 },
      ],
    });
    const c = contacts.createContact(loc.id, { first_name: "Ana", last_name: "S", email: "ana@x.com" });
    contacts.addTag(loc.id, c.id, "HOT");
    await flush(automations);
    const [run] = automations.listRuns({ automationId: a.id });
    expect(run.status).toBe("done");
    expect(run.log.map((l) => l.ok)).toEqual([false, true, true, true]); // email not set up → logged, continues
    expect(run.log[0].message).toMatch(/isn't set up/);
    expect(contacts.getContact(c.id)!.tags).toContain("nurtured");
    expect(pipelines.listOpportunities(p.id)[0].title).toBe("Ana S");
    expect(contacts.listTasks(loc.id)[0].title).toBe("Call Ana");
  });

  it("waits, then resumes when due; stops on unmet condition; no double enrollment", async () => {
    const { contacts, automations, loc } = await setup();
    const a = automations.createAutomation(loc.id, {
      name: "Nurture",
      enabled: true,
      trigger: { type: "contact_created" },
      steps: [
        { type: "wait", amount: 2, unit: "days" },
        { type: "if_tag", tag: "vip", has: true },
        { type: "add_tag", tag: "should-not-happen" },
      ],
    });
    const c = contacts.createContact(loc.id, { email: "b@x.com" });
    await flush(automations);
    let [run] = automations.listRuns({ automationId: a.id });
    expect(run.status).toBe("active");
    expect(run.step_index).toBe(1);
    expect(automations.enroll(a, c.id, { type: "contact_created", contactId: c.id })).toBeNull(); // already in progress
    // Fast-forward: make the wait due.
    const { db } = await import("@/lib/db");
    db().prepare("UPDATE automation_runs SET next_run_at = datetime('now', '-1 minute')").run();
    await automations.processDueRuns();
    [run] = automations.listRuns({ automationId: a.id });
    expect(run.status).toBe("done");
    expect(run.log.at(-1)!.message).toMatch(/not met/);
    expect(contacts.getContact(c.id)!.tags).not.toContain("should-not-happen");
  });

  it("stops runaway loops between automations", async () => {
    const { contacts, automations, loc } = await setup();
    automations.createAutomation(loc.id, { name: "A", enabled: true, trigger: { type: "tag_added", tag: "a" }, steps: [{ type: "remove_tag", tag: "b" }, { type: "add_tag", tag: "b" }] });
    automations.createAutomation(loc.id, { name: "B", enabled: true, trigger: { type: "tag_added", tag: "b" }, steps: [{ type: "remove_tag", tag: "a" }, { type: "add_tag", tag: "a" }] });
    const c = contacts.createContact(loc.id, { email: "c@x.com" });
    contacts.addTag(loc.id, c.id, "a");
    for (let i = 0; i < 10; i++) await flush(automations);
    expect(automations.listRuns({ locationId: loc.id }).length).toBeLessThanOrEqual(6);
  });

  it("ignores disabled automations and other sub-accounts; validates references", async () => {
    const { contacts, pipelines, automations, loc, other } = await setup();
    automations.createAutomation(loc.id, { name: "Off", enabled: false, trigger: { type: "contact_created" }, steps: [{ type: "add_tag", tag: "x" }] });
    automations.createAutomation(other.id, { name: "Other", enabled: true, trigger: { type: "contact_created" }, steps: [{ type: "add_tag", tag: "x" }] });
    contacts.createContact(loc.id, { email: "d@x.com" });
    await flush(automations);
    expect(automations.listRuns({ locationId: loc.id })).toEqual([]);
    const otherPipeline = pipelines.createPipeline(other.id, "Theirs");
    expect(() =>
      automations.createAutomation(loc.id, { name: "Bad", trigger: { type: "contact_created" }, steps: [{ type: "create_opportunity", pipelineId: otherPipeline.id }] }),
    ).toThrow(/pipeline/);
  });

  it("renders merge fields", async () => {
    const { email } = await setup();
    expect(email.renderTemplate("Hi {{ contact.first_name }} from {{business.name}}{{missing.x}}", { contact: { first_name: "Ana" }, business: { name: "Acme" } })).toBe(
      "Hi Ana from Acme",
    );
  });
});
