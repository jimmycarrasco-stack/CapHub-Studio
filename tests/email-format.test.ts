import { describe, expect, it, vi } from "vitest";
import { renderEmailHtml, renderEmailText, safeUrl } from "@/lib/crm/email-format";

describe("email formatting", () => {
  it("renders bold, italic, links, buttons, bullets and bare URLs", () => {
    const html = renderEmailHtml("Hi **Ana**, _welcome_!\n\nSee [our site](https://acme.test/a?b=1&c=2) or https://acme.test/x.\n\n[[Book a call|https://cal.test/me]]\n\n- one\n- two");
    expect(html).toContain("<strong>Ana</strong>");
    expect(html).toContain("<em>welcome</em>");
    expect(html).toContain('href="https://acme.test/a?b=1&amp;c=2"');
    expect(html).toContain('href="https://acme.test/x"');
    expect(html).toMatch(/<a href="https:\/\/cal\.test\/me" style="display:inline-block[^"]*">Book a call<\/a>/);
    expect(html).toContain("<li");
  });

  it("neutralizes HTML and unsafe link schemes", () => {
    const html = renderEmailHtml('<script>alert(1)</script> [x](javascript:alert(1)) [[Go|data:text/html,hi]] <img src=x onerror=1>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/href="(javascript|data):/);
    expect(safeUrl('https://a.test/"onmouseover=')).toBeNull();
    expect(safeUrl("www.acme.test")).toBe("https://www.acme.test");
  });

  it("makes a readable plain-text version", () => {
    expect(renderEmailText("**Hi** [site](https://a.test) [[Book|https://b.test]]")).toBe("Hi site (https://a.test) Book: https://b.test");
  });
});

describe("attachments", () => {
  it("stores files per sub-account and refuses foreign or blocked files", async () => {
    vi.resetModules();
    (globalThis as { __caphubDb?: unknown }).__caphubDb = undefined;
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "caphub-files-")), "t.db");
    process.env.APP_SECRET = "s".repeat(40);
    const auth = await import("@/lib/auth");
    const files = await import("@/lib/crm/files");
    const pipelines = await import("@/lib/crm/pipelines");
    const a = auth.createLocation({ name: "A" });
    const b = auth.createLocation({ name: "B" });
    const f = await files.saveFile(a.id, "../../etc/Price list.pdf", "application/pdf", Buffer.from("%PDF-1.4"));
    expect(f.name).toBe("Price list.pdf");
    expect((await files.readFileData(f)).toString()).toBe("%PDF-1.4");
    expect(files.resolveAttachments(a.id, [f.id])[0].path).toContain(a.id);
    expect(() => files.resolveAttachments(b.id, [f.id])).toThrow(/no longer exists/);
    await expect(files.saveFile(a.id, "run.exe", "", Buffer.from("x"))).rejects.toThrow(/can't be attached/);
    await files.deleteFile(f);
    expect(files.listFiles(a.id)).toHaveLength(0);
    // migration 4 gave sub-accounts without a pipeline a starter one only on upgrade; new ones start empty here
    expect(Array.isArray(pipelines.listPipelines(a.id))).toBe(true);
  });
});
