import "server-only";
import { headers } from "next/headers";

/** Public base URL for server components (PUBLIC_BASE_URL, else the request's host). */
export async function baseUrlFromHeaders() {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
}
