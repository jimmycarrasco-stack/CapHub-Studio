import { describe, expect, it } from "vitest";
import { stripCaphubCookies } from "@/lib/apps/preview-proxy";

describe("preview proxy cookie stripping", () => {
  it("removes CapHub cookies and keeps the app's own", () => {
    expect(stripCaphubCookies("caphub_session=abc; s_app1=xyz; theme=dark")).toBe("s_app1=xyz; theme=dark");
    expect(stripCaphubCookies("CapHub_Session=abc")).toBeUndefined();
    expect(stripCaphubCookies(undefined)).toBeUndefined();
    expect(stripCaphubCookies("a=1")).toBe("a=1");
  });
});
