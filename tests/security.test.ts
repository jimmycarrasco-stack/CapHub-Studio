import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, passwordMatches, verifySessionToken, SESSION_TTL_MS } from "@/lib/session";

const SECRET = "x".repeat(40);

describe("session tokens", () => {
  it("verifies a fresh token and rejects tampering, wrong secret and expiry", async () => {
    const t = await createSessionToken(SECRET, 1_000);
    expect(await verifySessionToken(t, SECRET, 2_000)).toBe(true);
    expect(await verifySessionToken(t, "y".repeat(40), 2_000)).toBe(false);
    expect(await verifySessionToken(t.replace(/^\d+/, "9999999999999"), SECRET, 2_000)).toBe(false);
    expect(await verifySessionToken(t, SECRET, 1_000 + SESSION_TTL_MS + 1)).toBe(false);
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken("garbage", SECRET)).toBe(false);
  });

  it("compares passwords", async () => {
    expect(await passwordMatches("hunter2", "hunter2")).toBe(true);
    expect(await passwordMatches("hunter3", "hunter2")).toBe(false);
  });
});

describe("api key encryption", () => {
  const prev = process.env.APP_SECRET;
  beforeAll(() => {
    process.env.APP_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.APP_SECRET = prev;
  });

  it("round-trips and never stores plaintext", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const enc = encrypt("sk-ant-secret-1234");
    expect(enc).not.toContain("secret");
    expect(decrypt(enc)).toBe("sk-ant-secret-1234");
    expect(encrypt("same")).not.toBe(encrypt("same")); // random IV
  });

  it("fails to decrypt with a different APP_SECRET", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const enc = encrypt("k");
    process.env.APP_SECRET = "z".repeat(40);
    expect(() => decrypt(enc)).toThrow();
    process.env.APP_SECRET = SECRET;
  });
});
