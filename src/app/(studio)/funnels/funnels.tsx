"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Badge, Button, EmptyState, Field, Input, Modal, Select, toast } from "@/components/ui";
import type { Funnel } from "@/lib/crm/funnels";
import { OpenGuideButton } from "@/components/guide";

type SiteOpt = { id: string; name: string };

export function Funnels({ initial, sites }: { initial: Funnel[]; sites: SiteOpt[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Funnel | "new" | null>(null);

  async function copy(path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "success");
    } catch {
      toast(url);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <OpenGuideButton prompt="Help me build a funnel. Ask me about my offer and who it's for, then build the pages and connect them.">Build a funnel with AI</OpenGuideButton>
        <Button variant="primary" onClick={() => setEditing("new")} disabled={!sites.length} title={sites.length ? undefined : "Create some pages first"}>
          New funnel
        </Button>
      </div>
      {initial.length === 0 ? (
        <EmptyState title="No funnels yet">
          {sites.length ? "Pick pages you've built and put them in order." : "Build your pages first on the Sites tab (e.g. an opt-in page and a thank-you page), then chain them here."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {initial.map((f) => {
            return (
              <div key={f.id} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{f.name}</h3>
                    <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand-600 hover:underline">
                      /f/{f.slug}
                    </a>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => copy(`/f/${f.slug}`)} disabled={!f.steps.length}>
                      Copy link
                    </Button>
                    <Button size="sm" onClick={() => setEditing(f)}>
                      Edit
                    </Button>
                  </div>
                </div>
                {f.steps.length === 0 ? (
                  <p className="mt-3 text-xs text-zinc-500">No steps yet.</p>
                ) : (
                  <ol className="mt-3 flex flex-wrap items-center gap-1.5">
                    {f.steps.map((s, i) => (
                      <li key={s.site_id} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-zinc-300">→</span>}
                        <Link href={`/sites/${s.site_id}`} className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs ring-1 ring-zinc-200 hover:bg-zinc-100">
                          <span className="mr-1 text-zinc-400">{i + 1}.</span>
                          {s.name}
                        </Link>
                        {!s.has_html && <Badge tone="amber">empty</Badge>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <FunnelModal
          funnel={editing === "new" ? null : editing}
          sites={sites}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function FunnelModal({ funnel, sites, onClose, onSaved }: { funnel: Funnel | null; sites: SiteOpt[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(funnel?.name ?? "");
  const [slug, setSlug] = useState(funnel?.slug ?? "");
  const [steps, setSteps] = useState<string[]>(funnel?.steps.map((s) => s.site_id) ?? []);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const nameOf = (id: string) => sites.find((s) => s.id === id)?.name ?? "Page";
  const available = sites.filter((s) => !steps.includes(s.id));

  async function save() {
    setBusy(true);
    try {
      if (funnel) await api(`/api/funnels/${funnel.id}`, { method: "PATCH", json: { name, slug: slug || name, siteIds: steps } });
      else await api("/api/funnels", { method: "POST", json: { name, siteIds: steps } });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api(`/api/funnels/${funnel!.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  return (
    <Modal open onClose={onClose} title={funnel ? "Edit funnel" : "New funnel"}>
      <div className="space-y-4">
        <Field label="Name" htmlFor="fn">
          <Input id="fn" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Free guide funnel" />
        </Field>
        {funnel && (
          <Field label="URL" hint="Lowercase letters, numbers and dashes" htmlFor="fs">
            <div className="flex items-center gap-1 text-sm">
              <span className="font-mono text-zinc-400">/f/</span>
              <Input id="fs" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </Field>
        )}
        <div className="space-y-1.5">
          <div className="text-[13px] font-medium text-zinc-700">Steps</div>
          {steps.length === 0 && <p className="text-xs text-zinc-500">Add the pages in the order visitors should see them.</p>}
          {steps.map((id, i) => (
            <div key={id} className="flex items-center gap-1.5 rounded-lg bg-zinc-50 px-3 py-1.5 text-sm ring-1 ring-zinc-200">
              <span className="text-xs text-zinc-400">{i + 1}.</span>
              <span className="flex-1 truncate">{nameOf(id)}</span>
              <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-30">
                ↑
              </button>
              <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="px-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-30">
                ↓
              </button>
              <button type="button" aria-label="Remove step" onClick={() => setSteps(steps.filter((x) => x !== id))} className="px-1 text-zinc-400 hover:text-red-600">
                ✕
              </button>
            </div>
          ))}
          {available.length > 0 && (
            <div className="flex gap-2 pt-1">
              <Select aria-label="Add page" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a page…</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Button
                aria-label="Add step"
                disabled={!pick}
                onClick={() => {
                  setSteps([...steps, pick]);
                  setPick("");
                }}
              >
                Add
              </Button>
            </div>
          )}
          <p className="text-xs text-zinc-500">Funnel pages are live at the funnel URL even if the page itself isn&apos;t published.</p>
        </div>
        <div className="flex items-center justify-between">
          {funnel ? (
            confirmDel ? (
              <span className="flex items-center gap-2 text-xs">
                Delete funnel?
                <Button size="sm" variant="danger" onClick={remove}>
                  Delete
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)}>
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
