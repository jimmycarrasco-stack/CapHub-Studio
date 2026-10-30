import { describe, expect, it, vi } from "vitest";

async function setup() {
  vi.resetModules();
  (globalThis as { __caphubDb?: unknown }).__caphubDb = undefined;
  process.env.DATABASE_PATH = ":memory:";
  process.env.APP_SECRET = "s".repeat(40);
  process.env.PUBLIC_BASE_URL = "https://studio.agency.test";
  const auth = await import("@/lib/auth");
  const repo = await import("@/lib/repo");
  const funnels = await import("@/lib/crm/funnels");
  const domains = await import("@/lib/crm/domains");
  const a = auth.createLocation({ name: "A" });
  const b = auth.createLocation({ name: "B" });
  const site = repo.createSite("Landing", a.id);
  const otherSite = repo.createSite("Theirs", b.id);
  const funnel = funnels.createFunnel(a.id, "Promo", [site.id]);
  return { domains, a, b, site, otherSite, funnel };
}

const fakeDns = (txt: Record<string, string[][]>, a: Record<string, string[]> = {}) => ({
  resolveTxt: async (name: string) => {
    if (txt[name]) return txt[name];
    throw Object.assign(new Error("nf"), { code: "ENOTFOUND" });
  },
  resolve4: async (name: string) => a[name] ?? [],
  resolveCname: async () => {
    throw Object.assign(new Error("nf"), { code: "ENODATA" });
  },
});

describe("custom domains", () => {
  it("normalizes input and refuses app hosts", async () => {
    const { domains } = await setup();
    expect(domains.normalizeDomain(" HTTPS://Book.Acme.com/path?x=1 ")).toBe("book.acme.com");
    expect(() => domains.normalizeDomain("localhost")).toThrow();
    expect(() => domains.normalizeDomain("10.0.0.1")).toThrow();
    expect(() => domains.normalizeDomain("studio.agency.test")).toThrow(/CapHub itself/);
    expect(() => domains.normalizeDomain("not a domain")).toThrow();
    expect(domains.isAppHost("192.168.1.52:3000")).toBe(true);
    expect(domains.isAppHost("book.acme.com")).toBe(false);
  });

  it("only goes live after the TXT record matches; one owner per domain", async () => {
    const { domains, a, b, site, otherSite, funnel } = await setup();
    expect(() => domains.addDomain(a.id, { domain: "x.acme.com", targetType: "site", targetId: otherSite.id })).toThrow(/doesn't exist/);
    const d = domains.addDomain(a.id, { domain: "book.acme.com", targetType: "site", targetId: site.id });
    expect(() => domains.addDomain(b.id, { domain: "book.acme.com", targetType: "site", targetId: otherSite.id })).toThrow(/another account/);
    expect(domains.liveDomainFor("book.acme.com")).toBeNull();

    domains.__setResolver(fakeDns({ "_caphub.book.acme.com": [["caphub-verify=wrong"]] }));
    expect((await domains.verifyDomain(d)).verified).toBe(false);
    domains.__setResolver(fakeDns({ "_caphub.book.acme.com": [["caphub-verify=", d.verify_token]] }, { "book.acme.com": ["203.0.113.5"] }));
    const r = await domains.verifyDomain(d);
    expect(r.verified).toBe(true);
    expect(r.pointsTo).toEqual(["A 203.0.113.5"]);
    expect(domains.liveDomainFor("BOOK.acme.com:443")?.domain.target_id).toBe(site.id);

    domains.retargetDomain(domains.getDomain("book.acme.com")!, "funnel", funnel.id);
    expect(domains.getDomain("book.acme.com")?.target_type).toBe("funnel");
    expect(domains.isOwnDomainUrl(a.id, "https://book.acme.com/2")).toBe(true);
    expect(domains.isOwnDomainUrl(b.id, "https://book.acme.com/2")).toBe(false);
    expect(domains.isOwnDomainUrl(a.id, "javascript:alert(1)")).toBe(false);
    domains.__setResolver(undefined);
  });

  it("redirects www to the connected apex (and back)", async () => {
    const { domains, a, site } = await setup();
    const d = domains.addDomain(a.id, { domain: "acme.com", targetType: "site", targetId: site.id });
    domains.__setResolver(fakeDns({ "_caphub.acme.com": [[`caphub-verify=${d.verify_token}`]] }));
    await domains.verifyDomain(d);
    expect(domains.liveDomainFor("www.acme.com")?.redirectTo).toBe("acme.com");
    domains.__setResolver(undefined);
  });
});
