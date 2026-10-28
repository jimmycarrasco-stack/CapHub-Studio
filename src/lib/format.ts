/** Plain helpers usable from both server and client components. */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** "5m ago" from a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS"). */
export function timeAgo(sqliteUtc: string, now = Date.now()) {
  const t = new Date(sqliteUtc.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(sqliteUtc) ? "" : "Z")).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}
