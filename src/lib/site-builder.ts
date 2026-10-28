/**
 * Pure helpers for the Site Builder (no DB / network) — unit tested.
 */

export const SITE_SYSTEM_PROMPT = `You are CapHub Studio's site builder: an expert web designer and front-end engineer.
You produce production-quality, responsive, accessible single-page websites, landing pages, funnels, booking pages and forms.

OUTPUT FORMAT (strict):
1. First line: "SUMMARY: " followed by one short sentence describing what you built or changed.
2. Then exactly one fenced code block tagged html containing the COMPLETE document, from <!DOCTYPE html> to </html>.
Never output partial documents, diffs, or placeholders like "rest unchanged". Nothing after the code block.

TECHNICAL RULES:
- One self-contained HTML file. Use Tailwind via <script src="https://cdn.tailwindcss.com"></script>.
- Google Fonts are allowed. Small vanilla JS in <script> tags is allowed; no frameworks, no build step.
- Images: never invent photo URLs. Use https://placehold.co/WIDTHxHEIGHT?text=Label, inline SVG, CSS gradients, or emoji.
- Mobile-first, semantic HTML, sufficient color contrast, alt text, labels on every input.
- Forms: give every input a name attribute, give each <form> a data-form-name="..." attribute, and do NOT set action or method.
  The platform captures submissions automatically, saves the person as a CRM contact and shows a thank-you message (or moves to the
  next funnel step). Use these input names so contacts are filled in: first_name, last_name (or name), email, phone, company.
- Selling: to sell a product, add data-caphub-checkout="PRODUCT_ID" to a button or link (use only IDs from the PRODUCTS list you're given;
  if none fits, don't invent one). Clicking it opens secure Stripe checkout. Show the real name and price from the list.
- Booking requests: build a form (name, email, phone, preferred date/time, notes) — no third-party embeds.
- Do not add a chat widget yourself; the platform injects one when an AI agent is attached.
- Write real, specific marketing copy for the business described. No lorem ipsum.`;

export function buildGenerateMessages(opts: {
  instruction: string;
  currentHtml: string;
  history: { role: "user" | "assistant"; content: string }[];
  products?: { id: string; name: string; price: string }[];
}) {
  const recent = opts.history.slice(-8).map((m) => `${m.role === "user" ? "Request" : "Result"}: ${m.content}`).join("\n");
  const catalog = opts.products?.length
    ? `PRODUCTS (for checkout buttons):\n${opts.products.map((p) => `- ${p.id}: ${p.name} — ${p.price}`).join("\n")}\n\n`
    : "";
  if (!opts.currentHtml.trim()) {
    return [{ role: "user" as const, content: `${catalog}Build this:\n\n${opts.instruction}` }];
  }
  return [
    {
      role: "user" as const,
      content:
        catalog +
        (recent ? `Earlier requests in this project:\n${recent}\n\n` : "") +
        `Current document:\n\`\`\`html\n${opts.currentHtml}\n\`\`\`\n\n` +
        `Apply this change and return the complete updated document:\n${opts.instruction}`,
    },
  ];
}

/** Pulls the HTML document and summary out of a model response. Returns null html if none found. */
export function parseSiteResponse(text: string): { html: string | null; summary: string } {
  const summaryMatch = text.match(/^\s*SUMMARY:\s*(.+)$/m);
  const summary = summaryMatch?.[1]?.trim() || "Updated the page.";

  let html: string | null = null;
  const fenced = text.match(/```html\s*\n([\s\S]*?)```/i) ?? text.match(/```\s*\n(<!DOCTYPE[\s\S]*?)```/i);
  if (fenced) html = fenced[1].trim();
  else {
    // Fallback: raw document, or a document whose closing fence was cut off.
    const start = text.search(/<!DOCTYPE html|<html[\s>]/i);
    if (start >= 0) html = text.slice(start).replace(/```\s*$/, "").trim();
  }
  if (html && !/<\/html>\s*$/i.test(html)) {
    // Truncated output — close it so the browser still renders something sensible.
    html += "\n</body></html>";
  }
  return { html, summary };
}

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "site"
  );
}

/** Derives a project name from the first prompt. */
export function nameFromPrompt(prompt: string) {
  const firstLine = prompt.trim().split(/\n/)[0].replace(/^(build|create|make|design)\s+(me\s+)?(a|an)?\s*/i, "");
  const words = firstLine.split(/\s+/).slice(0, 6).join(" ");
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  return name.replace(/[.,;:!?]+$/, "") || "Untitled site";
}

/**
 * Injects the platform runtime (form capture + optional agent chat widget) before </body>.
 * `mode: "preview"` makes forms show a notice instead of storing a submission.
 */
export function injectRuntime(
  html: string,
  opts: { siteId: string; baseUrl: string; agentId?: string | null; mode: "live" | "preview"; next?: string | null; funnelId?: string | null },
) {
  const cfg = JSON.stringify({ siteId: opts.siteId, api: opts.baseUrl, mode: opts.mode, next: opts.next ?? null, funnelId: opts.funnelId ?? null }).replace(
    /</g,
    "\\u003c",
  );
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  let tags = `\n<script>window.__CAPHUB__=${cfg};</script>\n<script src="${attr(opts.baseUrl)}/caphub-runtime.js" defer></script>`;
  if (opts.agentId) {
    tags += `\n<script src="${attr(opts.baseUrl)}/widget.js" data-agent="${attr(opts.agentId)}" data-api="${attr(opts.baseUrl)}" defer></script>`;
  }
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tags}\n</body>`) : html + tags;
}

/** Security headers for published pages (sites and funnel steps). */
export const PUBLISHED_PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // Opaque origin: page scripts can't make credentialed requests to CapHub.
  "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
};

/** Pulls standard contact fields out of a form submission (field names vary page to page). */
export function contactFromForm(data: Record<string, string>) {
  const norm = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ""), String(v ?? "").trim()]));
  const pick = (...keys: string[]) => keys.map((k) => norm[k]).find((v) => v) ?? "";
  let first = pick("firstname", "first", "fname", "givenname");
  let last = pick("lastname", "last", "lname", "surname", "familyname");
  const full = pick("name", "fullname", "yourname", "contactname");
  if (!first && full) [first, last] = [full.split(/\s+/)[0], full.split(/\s+/).slice(1).join(" ")];
  const email = pick("email", "emailaddress", "youremail", "mail");
  return {
    first_name: first,
    last_name: last,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    phone: pick("phone", "phonenumber", "tel", "telephone", "mobile", "cell"),
    company: pick("company", "business", "businessname", "organization", "organisation"),
  };
}
