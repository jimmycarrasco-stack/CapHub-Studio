"use client";

import { useEffect, useRef, useState } from "react";
import { renderEmailHtml, safeUrl } from "@/lib/crm/email-format";
import { Button, cx, Input, Select, Spinner, Textarea, toast } from "./ui";

/**
 * Email editor used by one-off emails and automation steps: formatting toolbar (bold, italic,
 * links, button, bullets, merge fields), a live preview, and attachments from the sub-account's
 * files library.
 */

export interface LibraryFile {
  id: string;
  name: string;
  size: number;
}

const MERGE_FIELDS = [
  ["First name", "{{contact.first_name}}"],
  ["Last name", "{{contact.last_name}}"],
  ["Full name", "{{contact.name}}"],
  ["Email", "{{contact.email}}"],
  ["Phone", "{{contact.phone}}"],
  ["Company", "{{contact.company}}"],
  ["Business name", "{{business.name}}"],
] as const;

export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

let libraryCache: Promise<LibraryFile[]> | null = null;
const loadLibrary = (refresh = false) => {
  if (refresh || !libraryCache) libraryCache = fetch("/api/files").then((r) => (r.ok ? r.json() : []));
  return libraryCache;
};

export function EmailComposer({
  body,
  onBodyChange,
  attachments,
  onAttachmentsChange,
  rows = 8,
  placeholder,
  label = "Message",
  attachmentsOnly = false,
}: {
  body: string;
  onBodyChange: (v: string) => void;
  attachments: string[];
  onAttachmentsChange: (ids: string[]) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
  /** Show only the attachments picker (e.g. when AI writes the text). */
  attachmentsOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [linkKind, setLinkKind] = useState<"link" | "button" | null>(null);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let live = true;
    loadLibrary().then((l) => live && setLibrary(l));
    return () => {
      live = false;
    };
  }, []);

  /** Replaces the current selection (or inserts at the cursor) and restores focus. */
  function insert(fn: (selected: string) => string, selectInner?: (inserted: string) => [number, number]) {
    const el = ref.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const text = fn(body.slice(start, end));
    onBodyChange(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const [a, b] = selectInner ? selectInner(text) : [text.length, text.length];
      el.setSelectionRange(start + a, start + b);
    });
  }

  const wrap = (mark: string, fallback: string) =>
    insert(
      (s) => `${mark}${s || fallback}${mark}`,
      (t) => [mark.length, t.length - mark.length],
    );

  function openLink(kind: "link" | "button") {
    const el = ref.current;
    const selected = el ? body.slice(el.selectionStart, el.selectionEnd) : "";
    setLinkText(selected || (kind === "button" ? "Book a call" : ""));
    setLinkUrl("https://");
    setLinkKind(kind);
  }

  function addLink() {
    const url = safeUrl(linkUrl);
    if (!url) return toast("Enter a full web address starting with https://", "error");
    const text = linkText.trim() || url;
    insert(() => (linkKind === "button" ? `\n\n[[${text.replace(/[|\]]/g, "")}|${url}]]\n\n` : `[${text.replace(/[\]]/g, "")}](${url})`));
    setLinkKind(null);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        added.push(data.id);
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    setLibrary(await loadLibrary(true));
    onAttachmentsChange([...attachments, ...added].slice(0, 10));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const attached = attachments.map((id) => library.find((f) => f.id === id) ?? { id, name: "(file removed)", size: 0 });
  const available = library.filter((f) => !attachments.includes(f.id));
  const total = attached.reduce((n, f) => n + f.size, 0);

  const tool = "rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900";

  return (
    <div className="space-y-2">
      {!attachmentsOnly && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-zinc-700">{label}</span>
            <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs" role="tablist" aria-label="Editor mode">
              {(["write", "preview"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cx("rounded px-2.5 py-0.5 font-medium capitalize", mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {mode === "write" ? (
            <div className="rounded-lg ring-1 ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-500">
              <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-100 px-1.5 py-1" role="toolbar" aria-label="Formatting">
                <button type="button" className={cx(tool, "font-bold")} onClick={() => wrap("**", "bold text")} title="Bold">
                  B
                </button>
                <button type="button" className={cx(tool, "italic")} onClick={() => wrap("_", "italic text")} title="Italic">
                  I
                </button>
                <button type="button" className={tool} onClick={() => openLink("link")}>
                  🔗 Link
                </button>
                <button type="button" className={tool} onClick={() => openLink("button")}>
                  ▭ Button
                </button>
                <button
                  type="button"
                  className={tool}
                  onClick={() =>
                    insert((s) =>
                      (s || "First point\nSecond point")
                        .split("\n")
                        .map((l) => `- ${l.replace(/^\s*[-*•]\s+/, "")}`)
                        .join("\n"),
                    )
                  }
                >
                  • List
                </button>
                <select
                  aria-label="Insert merge field"
                  value=""
                  onChange={(e) => e.target.value && insert(() => e.target.value)}
                  className="ml-auto rounded bg-transparent px-1 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  <option value="">Insert field…</option>
                  {MERGE_FIELDS.map(([l, v]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              {linkKind && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-2 py-2">
                  <Input
                    aria-label={linkKind === "button" ? "Button text" : "Link text"}
                    placeholder={linkKind === "button" ? "Button text" : "Link text"}
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="h-8 max-w-[180px]"
                  />
                  <Input
                    aria-label="Web address"
                    placeholder="https://"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addLink();
                      }
                    }}
                    className="h-8 min-w-[180px] flex-1"
                    autoFocus
                  />
                  <Button size="sm" variant="primary" type="button" onClick={addLink}>
                    Add {linkKind}
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setLinkKind(null)}>
                    Cancel
                  </Button>
                </div>
              )}
              <Textarea
                ref={ref}
                aria-label={label}
                rows={rows}
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                placeholder={placeholder}
                className="rounded-t-none ring-0 focus:ring-0"
              />
            </div>
          ) : (
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:16px">${renderEmailHtml(body || "(empty)")}</body>`}
              className="h-64 w-full rounded-lg bg-white ring-1 ring-zinc-200"
            />
          )}
        </>
      )}

      <div className="space-y-1.5">
        {attached.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {attached.map((f) => (
              <li key={f.id} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 py-1 pr-1 pl-2.5 text-xs ring-1 ring-zinc-200">
                <span aria-hidden="true">📎</span>
                <span className="max-w-[200px] truncate">{f.name}</span>
                {f.size > 0 && <span className="text-zinc-400">{fmtSize(f.size)}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onAttachmentsChange(attachments.filter((x) => x !== f.id))}
                  className="rounded px-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} aria-label="Attach files" />
          <Button size="sm" type="button" onClick={() => fileInput.current?.click()} disabled={uploading || attachments.length >= 10}>
            {uploading ? <Spinner className="size-3.5" /> : "📎"} Attach file
          </Button>
          {available.length > 0 && attachments.length < 10 && (
            <Select
              aria-label="Attach a file you uploaded before"
              value=""
              onChange={(e) => e.target.value && onAttachmentsChange([...attachments, e.target.value])}
              className="h-8 max-w-[240px] text-xs"
            >
              <option value="">Or choose an uploaded file…</option>
              {available.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({fmtSize(f.size)})
                </option>
              ))}
            </Select>
          )}
          <span className="text-xs text-zinc-400">{attached.length ? `${fmtSize(total)} of 20 MB` : "Up to 10 files, 15 MB each"}</span>
        </div>
      </div>
    </div>
  );
}
