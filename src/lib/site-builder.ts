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
  The platform captures submissions automatically and shows a thank-you message.
- Booking requests: build a form (name, email, phone, preferred date/time, notes) — no third-party embeds.
- Do not add a chat widget yourself; the platform injects one when an AI agent is attached.
- Write real, specific marketing copy for the business described. No lorem ipsum.`;

export function buildGenerateMessages(opts: {
  instruction: string;
  currentHtml: string;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const recent = opts.history.slice(-8).map((m) => `${m.role === "user" ? "Request" : "Result"}: ${m.content}`).join("\n");
  if (!opts.currentHtml.trim()) {
    return [{ role: "user" as const, content: `Build this:\n\n${opts.instruction}` }];
  }
  return [
    {
      role: "user" as const,
      content:
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
export function injectRuntime(html: string, opts: { siteId: string; baseUrl: string; agentId?: string | null; mode: "live" | "preview" }) {
  const cfg = JSON.stringify({ siteId: opts.siteId, api: opts.baseUrl, mode: opts.mode }).replace(/</g, "\\u003c");
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  let tags = `\n<script>window.__CAPHUB__=${cfg};</script>\n<script src="${attr(opts.baseUrl)}/caphub-runtime.js" defer></script>`;
  if (opts.agentId) {
    tags += `\n<script src="${attr(opts.baseUrl)}/widget.js" data-agent="${attr(opts.agentId)}" data-api="${attr(opts.baseUrl)}" defer></script>`;
  }
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tags}\n</body>`) : html + tags;
}
