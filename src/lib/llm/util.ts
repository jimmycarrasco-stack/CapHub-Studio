import { HttpError } from "../errors";

export async function collect(it: AsyncIterable<string>) {
  let out = "";
  for await (const chunk of it) out += chunk;
  return out;
}

/** Parses a tool-call JSON argument string; null if invalid or not an object. */
export function parseToolInput(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Turns SDK errors into short, admin-readable messages without leaking keys. */
export function normalizeError(label: string, err: unknown): Error {
  if (err instanceof HttpError) return err;
  if (err instanceof Error && err.name === "AbortError") return err;
  const status = (err as { status?: number })?.status;
  const raw = err instanceof Error ? err.message : String(err);
  let hint = "";
  // Out of prepaid credit / quota: say so plainly instead of dumping the provider's JSON.
  if (/credit balance is too low|insufficient_quota|exceeded your current quota|billing/i.test(raw)) {
    const where = label.toLowerCase().includes("openai") ? "platform.openai.com → Billing" : "console.anthropic.com → Plans & Billing";
    return new HttpError(
      402,
      `${label} account is out of credit, so AI features can't run. Add credits at ${where}, or switch to another provider in Settings → AI & runtime.`,
    );
  }
  if (status === 401) hint = " — the API key was rejected. Check it in Settings → AI & runtime.";
  else if (status === 404) hint = " — model not found. Check the model ID in Settings → AI & runtime.";
  else if (status === 429) hint = " — rate limited or out of credit.";
  return new HttpError(502, `${label} error${status ? ` (${status})` : ""}: ${raw.slice(0, 300)}${hint}`);
}
