/**
 * Email body formatting. Bodies are written as plain text with a few simple markers, so they're
 * easy to type, safe (no raw HTML from users or AI), and still read well as plain text:
 *
 *   **bold**   _italic_   [link text](https://example.com)   [[Button text|https://example.com]]
 *   bare URLs become links; blank lines separate paragraphs; lines starting with "- " are bullets.
 *
 * Client-safe (used by the composer preview and by the mail sender).
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only web, mail and phone links are allowed; anything else is shown as text. */
export function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u) && !/[\s"<>]/.test(u)) return u;
  if (/^www\.[^\s"<>]+$/i.test(u)) return `https://${u}`;
  return null;
}

const BRAND = "#4f46e5";

function inline(text: string): string {
  // Tokenize links/buttons first so their URLs aren't touched by other rules.
  const tokens: string[] = [];
  const keep = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = text.replace(/\[\[([^|\]\n]{1,120})\|([^\]\s]{1,2000})\]\]/g, (m, label: string, url: string) => {
    const u = safeUrl(url);
    return u
      ? keep(
          `<a href="${esc(u)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${esc(label.trim())}</a>`,
        )
      : m;
  });
  s = s.replace(/\[([^\]\n]{1,300})\]\(([^)\s]{1,2000})\)/g, (m, label: string, url: string) => {
    const u = safeUrl(url);
    return u ? keep(`<a href="${esc(u)}" style="color:${BRAND}">${esc(label)}</a>`) : m;
  });
  s = s.replace(/\b(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g, (url: string) => keep(`<a href="${esc(url)}" style="color:${BRAND}">${esc(url)}</a>`));
  s = esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => tokens[Number(i)]);
}

/** Renders a body to email-safe HTML (inline styles only). */
export function renderEmailHtml(body: string): string {
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
        return `<ul style="margin:0 0 14px;padding-left:22px">${lines.map((l) => `<li style="margin:0 0 4px">${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (/^\s*\[\[[^\]]+\]\]\s*$/.test(block)) return `<p style="margin:18px 0">${inline(block.trim())}</p>`;
      return `<p style="margin:0 0 14px">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#18181b">${html}</div>`;
}

/** Plain-text version for mail clients that don't show HTML. */
export function renderEmailText(body: string): string {
  return body
    .replace(/\[\[([^|\]\n]+)\|([^\]\s]+)\]\]/g, "$1: $2")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1");
}
