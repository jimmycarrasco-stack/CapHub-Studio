import { NextResponse, type NextRequest } from "next/server";
import { isAppHost } from "@/lib/app-host";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Fast first-line gate: signed-out visitors can only reach public surfaces.
 * Every page and API still checks the user's access to the specific sub-account/record.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/setup",
  "/set-password",
  "/api/auth/",
  "/p/", // published sites
  "/f/", // published funnels
  "/pay/", // product payment links
  "/api/public/", // forms, checkout, chat widget
  "/api/webhooks/", // Stripe, Twilio
  "/api/hooks/", // automation inbound webhooks
];
const PUBLIC_FILES = ["/widget.js", "/caphub-runtime.js", "/favicon.ico", "/sw.js"];

/** Paths served as-is on custom domains (page assets, forms/checkout APIs, payment pages). */
const CUSTOM_DOMAIN_PASSTHROUGH = ["/_next/", "/api/public/", "/pay/"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Custom domains: only the connected site/funnel is reachable — never the CapHub app itself.
  const host = req.headers.get("host") ?? "";
  if (host && !isAppHost(host)) {
    if (PUBLIC_FILES.includes(pathname) || CUSTOM_DOMAIN_PASSTHROUGH.some((p) => pathname.startsWith(p))) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = `/d/${encodeURIComponent(host.toLowerCase().replace(/:\d+$/, ""))}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (PUBLIC_FILES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.APP_SECRET)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
