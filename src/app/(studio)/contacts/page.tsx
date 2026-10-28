import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { contactName, listContacts, listLocationTags, listTasks } from "@/lib/crm/contacts";
import { cx, timeAgo } from "@/lib/format";
import { pageCtx } from "@/lib/page-ctx";
import { ContactsToolbar, NewContactButton } from "./contacts-toolbar";
import { TaskList } from "./task-list";

export const metadata = { title: "Contacts" };

const PAGE = 50;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCtx();
  const sp = await searchParams;
  const view = sp.view === "tasks" ? "tasks" : "contacts";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || undefined;
  const tag = sp.tag || undefined;
  const { total, contacts } = listContacts(ctx.location.id, { q, tag, limit: PAGE, offset: (page - 1) * PAGE });
  const tags = listLocationTags(ctx.location.id).map((t) => t.tag);
  const qs = (p: number) => `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(tag ? { tag } : {}), page: String(p) })}`;

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title="Contacts" subtitle="Everyone you do business with — leads, customers, and everything about them." actions={<NewContactButton />} />

      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        {(["contacts", "tasks"] as const).map((v) => (
          <Link
            key={v}
            href={v === "tasks" ? "/contacts?view=tasks" : "/contacts"}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize", view === v ? "border-brand-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}
          >
            {v}
          </Link>
        ))}
      </div>

      {view === "tasks" ? (
        <TaskList initial={listTasks(ctx.location.id, { limit: 500 })} />
      ) : (
        <>
          <ContactsToolbar q={q ?? ""} tag={tag ?? ""} tags={tags} />
          {contacts.length === 0 ? (
            <EmptyState title={q || tag ? "No contacts match" : "No contacts yet"}>
              {q || tag ? "Try a different search or tag." : "Add one, import a CSV, or publish a site with a form — submissions land here automatically."}
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Phone</th>
                      <th className="px-4 py-2.5">Tags</th>
                      <th className="px-4 py-2.5 text-right">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/contacts/${c.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
                            {contactName(c)}
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
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500">
                <span>
                  {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + contacts.length} of {total.toLocaleString()}
                </span>
                <span className="flex gap-3">
                  {page > 1 && (
                    <Link href={qs(page - 1)} className="font-medium text-brand-600 hover:underline">
                      ← Previous
                    </Link>
                  )}
                  {page * PAGE < total && (
                    <Link href={qs(page + 1)} className="font-medium text-brand-600 hover:underline">
                      Next →
                    </Link>
                  )}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
