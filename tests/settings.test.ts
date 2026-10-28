import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings + provider selection against a real in-memory SQLite database.
 */
beforeEach(() => {
  vi.resetModules();
  (globalThis as { __caphubDb?: unknown }).__caphubDb = undefined;
  process.env.DATABASE_PATH = ":memory:";
  process.env.APP_SECRET = "s".repeat(40);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("AI settings", () => {
  it("defaults to anthropic with no keys", async () => {
    const { getAiSettings } = await import("@/lib/settings");
    const s = getAiSettings();
    expect(s.activeProvider).toBe("anthropic");
    expect(s.providers.anthropic.keySource).toBe("none");
  });

  it("falls back to env keys, and stored keys take priority", async () => {
    process.env.OPENAI_API_KEY = "sk-env-AAAA";
    const { getAiSettings, updateAiSettings, resolveProvider } = await import("@/lib/settings");
    expect(getAiSettings().providers.openai).toMatchObject({ keySource: "env", keyHint: "AAAA" });
    updateAiSettings({ providers: { openai: { apiKey: "sk-stored-BBBB" } } });
    expect(getAiSettings().providers.openai).toMatchObject({ keySource: "settings", keyHint: "BBBB" });
    expect(resolveProvider("openai").apiKey).toBe("sk-stored-BBBB");
    updateAiSettings({ providers: { openai: { apiKey: null } } });
    expect(getAiSettings().providers.openai.keySource).toBe("env");
  });

  it("stores keys encrypted", async () => {
    const { updateAiSettings } = await import("@/lib/settings");
    const { db } = await import("@/lib/db");
    updateAiSettings({ providers: { anthropic: { apiKey: "sk-ant-plaintext" } } });
    const row = db().prepare("SELECT value FROM settings WHERE key = 'anthropic_api_key'").get() as { value: string };
    expect(row.value).not.toContain("plaintext");
  });

  it("switches the active provider and model", async () => {
    const { updateAiSettings, getAiSettings } = await import("@/lib/settings");
    const { getProvider } = await import("@/lib/llm");
    updateAiSettings({ activeProvider: "openai", providers: { openai: { model: "gpt-x", apiKey: "sk-1" }, anthropic: { apiKey: "sk-ant-1" } } });
    expect(getAiSettings().activeProvider).toBe("openai");
    expect(getProvider().name).toBe("openai");
    expect(getProvider().model).toBe("gpt-x");
    expect(getProvider("anthropic").name).toBe("anthropic"); // per-agent override
  });

  it("explains a missing key", async () => {
    const { getProvider } = await import("@/lib/llm");
    expect(() => getProvider()).toThrow(/has no API key/);
  });
});

describe("repo", () => {
  it("creates unique slugs and versions sites", async () => {
    const repo = await import("@/lib/repo");
    const a = repo.createSite("My Site");
    const b = repo.createSite("My Site");
    expect(a.slug).toBe("my-site");
    expect(b.slug).toBe("my-site-2");
    repo.saveSiteHtml(a.id, "<html>1</html>", "v1");
    const v2 = repo.saveSiteHtml(a.id, "<html>2</html>", "v2");
    expect(repo.getSite(a.id)!.html).toBe("<html>2</html>");
    expect(repo.listSiteVersions(a.id).map((v) => v.note)).toEqual(["v2", "v1"]);
    expect(repo.getSiteVersionHtml(a.id, v2)).toBe("<html>2</html>");
    expect(repo.getPublishedSiteBySlug("my-site")).toBeNull();
    repo.updateSite(a.id, { published: true });
    expect(repo.getPublishedSiteBySlug("my-site")?.id).toBe(a.id);
  });

  it("detaches agents from sites when the agent is deleted", async () => {
    const repo = await import("@/lib/repo");
    const agent = repo.createAgent({ name: "Ava" });
    const site = repo.createSite("S");
    repo.updateSite(site.id, { agent_id: agent.id });
    repo.addKnowledge(agent.id, "t", "c");
    repo.deleteAgent(agent.id);
    expect(repo.getSite(site.id)!.agent_id).toBeNull();
    expect(repo.listKnowledge(agent.id)).toEqual([]);
  });
});
