"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Button, Field, Input, Modal, Select, toast } from "@/components/ui";

export function ContactsToolbar({ q, tag, tags }: { q: string; tag: string; tags: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [importing, setImporting] = useState(false);
  const go = (next: { q?: string; tag?: string }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? query;
    const nt = next.tag ?? tag;
    if (nq.trim()) p.set("q", nq.trim());
    if (nt) p.set("tag", nt);
    router.push(`/contacts${p.size ? `?${p}` : ""}`);
  };
  const exportHref = `/api/contacts/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(tag ? { tag } : {}) })}`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form
        className="flex min-w-[220px] flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: query });
        }}
      >
        <Input type="search" aria-label="Search contacts" placeholder="Search name, email, phone, company…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      <Select aria-label="Filter by tag" value={tag} onChange={(e) => go({ tag: e.target.value })} className="w-auto min-w-[150px]">
        <option value="">All tags</option>
        {tags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <Button onClick={() => setImporting(true)}>Import CSV</Button>
      <a href={exportHref} className="inline-flex h-9 items-center rounded-lg bg-white px-4 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50">
        Export
      </a>
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={() => router.refresh()} />
    </div>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api<NonNullable<typeof result>>("/api/contacts/import", { method: "POST", json: { csv: await file.text(), tag: tag.trim() || undefined } });
      setResult(r);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setResult(null);
    setFile(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Import contacts">
      {result ? (
        <div className="space-y-3 text-sm">
          <p>
            <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated, <strong>{result.skipped}</strong> skipped.
          </p>
          {result.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Upload a CSV with a header row. Columns like <em>first name, last name, name, email, phone, company, tags</em> are detected automatically; other columns become custom
            fields. Existing emails are updated, not duplicated.
          </p>
          <Field label="CSV file" htmlFor="csv">
            <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </Field>
          <Field label="Tag everyone in this import (optional)" htmlFor="imptag">
            <Input id="imptag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. trade-show-2026" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!file} onClick={run}>
              Import
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function NewContactButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", phone: "", company: "", tags: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      const c = await api<{ id: string }>("/api/contacts", {
        method: "POST",
        json: { ...f, phone: f.phone || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) },
      });
      router.push(`/contacts/${c.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New contact
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New contact">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="fn">
              <Input id="fn" value={f.first_name} onChange={set("first_name")} autoFocus />
            </Field>
            <Field label="Last name" htmlFor="ln">
              <Input id="ln" value={f.last_name} onChange={set("last_name")} />
            </Field>
          </div>
          <Field label="Email" htmlFor="em">
            <Input id="em" type="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Phone" htmlFor="ph">
            <Input id="ph" type="tel" value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="Company" htmlFor="co">
            <Input id="co" value={f.company} onChange={set("company")} />
          </Field>
          <Field label="Tags" hint="Comma separated" htmlFor="tg">
            <Input id="tg" value={f.tags} onChange={set("tags")} placeholder="lead, newsletter" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!f.first_name && !f.last_name && !f.email && !f.phone}>
              Create contact
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
