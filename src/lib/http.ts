import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "./errors";

export { HttpError };

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
  return schema.parse(raw);
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Wraps a route handler with consistent JSON error responses. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
  opts: { cors?: boolean } = {},
) {
  return async (...args: Args): Promise<Response> => {
    try {
      const res = await fn(...args);
      if (opts.cors) for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
      return res;
    } catch (err) {
      let status = 500;
      let message = "Something went wrong";
      if (err instanceof HttpError) {
        status = err.status;
        message = err.message;
      } else if (err instanceof ZodError) {
        status = 400;
        message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
      } else {
        console.error(err);
        if (err instanceof Error) message = err.message;
      }
      return NextResponse.json({ error: message }, { status, headers: opts.cors ? CORS_HEADERS : undefined });
    }
  };
}

/** Public URL of this app, for embed snippets and runtime scripts in published pages. */
export function baseUrl(req: Request) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return configured || new URL(req.url).origin;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

// --- Minimal in-memory rate limiter (per process). Good enough for a single-node MVP. ---
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
  } else if (++b.count > limit) {
    throw new HttpError(429, "Too many requests — please slow down.");
  }
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}
