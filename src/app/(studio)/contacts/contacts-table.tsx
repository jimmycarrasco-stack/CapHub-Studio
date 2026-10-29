"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Badge, Button, Field, Input, Modal, timeAgo, toast } from "@/components/ui";
import { cx } from "@/lib/format";

export interface ContactRow {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  created_at: string;
}

type Target = { kind: "ids"; ids: string[] } | { kind: "all" };

export function ContactsTable({
  rows,
  total,
  rangeLabel,
  prevHref,
  nextHref,
  q,
  tag,
  isAdmin,
  allTags,
}: {
  rows: ContactRow[];
  total: number;
  rangeLabel: string;
  prevHref: string | null;
  nextHref: string | null;
  q: string;
  tag: string;
  isAdmin: boolean;
  allTags: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [dialog, setDialog] = useState<"delete" | "add_tag" | "remove_tag" | null>(null);

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? total : selected.size;
  const target: Target = allMatching ? { kind: "all" } : { kind: "ids", ids: [...selected] };

  const toggle = (id: string) => {
    setAllMatching(false);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected(allOnPage ? new Set() : new Set(pageIds));
  };
  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };

  return (
    <>
      {count > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <span className="font-medium">
            {count.toLocaleString()} selected
          </span>
          {!allMatching && allOnPage && total > pageIds.length && (
            <button type="button" onClick={() => setAllMatching(true)} className="text-brand-100 underline underline-offset-2 hover:text-white">
              Select all {total.toLocaleString()} {q || tag ? "matching" : ""} contacts
            </button>
          )}
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => setDialog("add_tag")}>
              Add tag
            </Button>
            <Button size="sm" onClick={() => setDialog("remove_tag")}>
              Remove tag
            </Button>
            {isAdmin && (
              <Button size="sm" variant="danger" onClick={() => setDialog("delete")}>
                Delete
              </Button>
            )}
            <Button size="sm" onClick={clear}>
              Cancel
            </Button>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" aria-label="Select all contacts on this page" checked={allOnPage} onChange={togglePage} className="size-4 accent-brand-600" />
                </th>
                <th className="px-2 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Tags</th>
                <th className="px-4 py-2.5 text-right">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((c) => {
                const on = allMatching || selected.has(c.id);
                return (
                  <tr key={c.id} className={cx("hover:bg-zinc-50", on && "bg-brand-50/60")}>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" aria-label={`Select ${c.name}`} checked={on} onChange={() => toggle(c.id)} className="size-4 accent-brand-600" />
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/contacts/${c.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
                        {c.name}
                      </Link>
                      {c.company && <div className="text-xs text-zinc-400">{c.company}</div>}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-600">{c.email ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600">{c.phone ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 4).map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                        {c.tags.length > 4 && <span className="text-xs text-zinc-400">+{c.tags.length - 4}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap text-zinc-400">{timeAgo(c.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500">
          <span>{rangeLabel}</span>
          <span className="flex gap-3">
            {prevHref && (
              <Link href={prevHref} onClick={clear} className="font-medium text-brand-600 hover:underline">
                ← Previous
              </Link>
            )}
            {nextHref && (
              <Link href={nextHref} onClick={clear} className="font-medium text-brand-600 hover:underline">
                Next →
              </Link>
            )}
          </span>
        </div>
      </div>

      {dialog && (
        <BulkDialog
          action={dialog}
          count={count}
          target={target}
          filter={{ q: q || undefined, tag: tag || undefined }}
          allTags={allTags}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            clear();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function BulkDialog({
  action,
  count,
  target,
  filter,
  allTags,
  onClose,
  onDone,
}: {
  action: "delete" | "add_tag" | "remove_tag";
  count: number;
  target: Target;
  filter: { q?: string; tag?: string };
  allTags: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [tag, setTag] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const noun = `${count.toLocaleString()} contact${count === 1 ? "" : "s"}`;

  async function run() {
    setBusy(true);
    try {
      const r = await api<{ count: number }>("/api/contacts/bulk", {
        method: "POST",
        json: {
          action,
          ...(target.kind === "all" ? { filter } : { ids: target.ids }),
          ...(action === "delete" ? { expectedCount: count } : { tag: tag.trim() }),
        },
      });
      toast(action === "delete" ? `Deleted ${r.count.toLocaleString()} contact(s)` : `Updated ${r.count.toLocaleString()} contact(s)`, "success");
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  if (action === "delete")
    return (
      <Modal open onClose={onClose} title={`Delete ${noun}?`}>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            This permanently deletes {noun} with their notes, tasks, email history and automation runs. Their deals and payments are kept but unlinked. <strong>This can&apos;t be undone</strong> — export them first if you might need them.
          </p>
          <Field label='Type "DELETE" to confirm' htmlFor="bulk-confirm">
            <Input id="bulk-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={confirm.trim() !== "DELETE"} onClick={run}>
              Delete {noun}
            </Button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title={`${action === "add_tag" ? "Add a tag to" : "Remove a tag from"} ${noun}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (tag.trim()) void run();
        }}
      >
        <Field label="Tag" htmlFor="bulk-tag" hint={action === "add_tag" ? "Automations triggered by this tag will start for each contact." : undefined}>
          <Input id="bulk-tag" list="bulk-tags" value={tag} onChange={(e) => setTag(e.target.value)} autoFocus />
          <datalist id="bulk-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!tag.trim()}>
            {action === "add_tag" ? "Add tag" : "Remove tag"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
