import "server-only";
import { db } from "../db";
import { getSite } from "../repo";
import { injectRuntime, PUBLISHED_PAGE_HEADERS } from "../site-builder";
import { getFunnelBySlug } from "./funnels";

/** True if a site's forms should accept submissions: published on its own, or part of a funnel. */
export function siteIsLive(siteId: string) {
  const s = db().prepare("SELECT published FROM sites WHERE id = ?").get(siteId) as { published: number } | undefined;
  if (!s) return false;
  if (s.published) return true;
  return !!db().prepare("SELECT 1 FROM funnel_steps WHERE site_id = ?").get(siteId);
}

export function notFoundPage(message = "This page isn't available.") {
  return new Response(`<!doctype html><title>Not found</title><p style="font-family:system-ui;padding:2rem;color:#555">${message}</p>`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Renders step N (1-based) of a funnel with the runtime pointed at the next step.
 * `stepUrl` builds step links (custom domains use "/2" instead of "/f/<slug>/2").
 */
export function renderFunnelStep(slug: string, stepNumber: number, base: string, stepUrl?: (n: number) => string) {
  const funnel = getFunnelBySlug(slug);
  if (!funnel || !Number.isInteger(stepNumber) || stepNumber < 1) return notFoundPage();
  const step = funnel.steps[stepNumber - 1];
  const site = step ? getSite(step.site_id) : null;
  if (!site || !site.html) return notFoundPage("This funnel step hasn't been built yet.");
  const next = funnel.steps[stepNumber] ? (stepUrl ? stepUrl(stepNumber + 1) : `${base}/f/${funnel.slug}/${stepNumber + 1}`) : null;
  const html = injectRuntime(site.html, {
    siteId: site.id,
    baseUrl: base,
    agentId: site.agent_id,
    mode: "live",
    next,
    funnelId: funnel.id,
  });
  return new Response(html, { headers: PUBLISHED_PAGE_HEADERS });
}
