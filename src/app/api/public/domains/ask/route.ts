import { liveDomainFor } from "@/lib/crm/domains";

/**
 * For Caddy's on-demand TLS "ask" check: 200 only for verified custom domains (and their www/apex
 * twin), so certificates are only ever requested for domains a customer has proven they own.
 */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  return new Response(null, { status: domain && liveDomainFor(domain) ? 200 : 404 });
}
