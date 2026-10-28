import { describe, expect, it } from "vitest";
import { cx, timeAgo } from "@/lib/format";

describe("format helpers (server-safe)", () => {
  it("timeAgo handles SQLite UTC timestamps", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(timeAgo("2026-10-28 11:59:30", now)).toBe("just now");
    expect(timeAgo("2026-10-28 11:55:00", now)).toBe("5m ago");
    expect(timeAgo("2026-10-28 09:00:00", now)).toBe("3h ago");
    expect(timeAgo("2026-10-26 12:00:00", now)).toBe("2d ago");
    expect(timeAgo("2026-10-28T11:55:00Z", now)).toBe("5m ago");
  });

  it("cx joins truthy classes", () => {
    expect(cx("a", false, null, "b", undefined)).toBe("a b");
  });
});
