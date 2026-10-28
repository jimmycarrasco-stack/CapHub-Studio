import { describe, expect, it } from "vitest";
import { buildGenerateMessages, injectRuntime, nameFromPrompt, parseSiteResponse, slugify } from "@/lib/site-builder";

describe("parseSiteResponse", () => {
  it("extracts summary and fenced html", () => {
    const r = parseSiteResponse("SUMMARY: Built a dental site.\n```html\n<!DOCTYPE html><html><body>Hi</body></html>\n```");
    expect(r.summary).toBe("Built a dental site.");
    expect(r.html).toBe("<!DOCTYPE html><html><body>Hi</body></html>");
  });

  it("falls back to a raw document without fences", () => {
    const r = parseSiteResponse("Here you go\n<!DOCTYPE html><html><body>x</body></html>");
    expect(r.html).toMatch(/^<!DOCTYPE html>/);
    expect(r.summary).toBe("Updated the page.");
  });

  it("closes a truncated document", () => {
    const r = parseSiteResponse("SUMMARY: x\n```html\n<!DOCTYPE html><html><body><h1>cut");
    expect(r.html).toMatch(/<\/html>$/);
  });

  it("returns null when no html present", () => {
    expect(parseSiteResponse("I can't do that").html).toBeNull();
  });
});

describe("injectRuntime", () => {
  const base = { siteId: "s1", baseUrl: "https://studio.test", mode: "live" as const };

  it("injects before the last </body>", () => {
    const out = injectRuntime("<html><body><p>a</p></body></html>", base);
    expect(out).toContain('window.__CAPHUB__={"siteId":"s1","api":"https://studio.test","mode":"live"}');
    expect(out.indexOf("caphub-runtime.js")).toBeLessThan(out.indexOf("</body>"));
    expect(out).not.toContain("widget.js");
  });

  it("adds widget when an agent is attached", () => {
    expect(injectRuntime("<body></body>", { ...base, agentId: "ag1" })).toContain('data-agent="ag1"');
  });

  it("escapes config to prevent breaking out of the script tag", () => {
    const out = injectRuntime("<body></body>", { ...base, siteId: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script><script>alert(1)");
  });

  it("appends when there is no body tag", () => {
    expect(injectRuntime("<h1>hi</h1>", base)).toMatch(/^<h1>hi<\/h1>[\s\S]*caphub-runtime/);
  });
});

describe("helpers", () => {
  it("slugify", () => {
    expect(slugify("Maple Smile Dental — Winnipeg!")).toBe("maple-smile-dental-winnipeg");
    expect(slugify("!!!")).toBe("site");
  });

  it("nameFromPrompt", () => {
    expect(nameFromPrompt("Build me a landing page for a roofing company in Winnipeg")).toBe("Landing page for a roofing company");
  });

  it("first generation sends just the instruction; edits include current html", () => {
    expect(buildGenerateMessages({ instruction: "x", currentHtml: "", history: [] })[0].content).toBe("Build this:\n\nx");
    const edit = buildGenerateMessages({ instruction: "make it blue", currentHtml: "<html></html>", history: [{ role: "user", content: "first" }] });
    expect(edit[0].content).toContain("<html></html>");
    expect(edit[0].content).toContain("Request: first");
  });
});
