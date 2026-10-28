import { HttpError } from "../errors";

export async function collect(it: AsyncIterable<string>) {
  let out = "";
  for await (const chunk of it) out += chunk;
  return out;
}

/** Turns SDK errors into short, admin-readable messages without leaking keys. */
export function normalizeError(label: string, err: unknown): Error {
  if (err instanceof HttpError) return err;
  if (err instanceof Error && err.name === "AbortError") return err;
  const status = (err as { status?: number })?.status;
  const raw = err instanceof Error ? err.message : String(err);
  let hint = "";
  if (status === 401) hint = " — the API key was rejected. Check it in Settings → AI Providers.";
  else if (status === 404) hint = " — model not found. Check the model ID in Settings → AI Providers.";
  else if (status === 429) hint = " — rate limited or out of credit.";
  return new HttpError(502, `${label} error${status ? ` (${status})` : ""}: ${raw.slice(0, 300)}${hint}`);
}
