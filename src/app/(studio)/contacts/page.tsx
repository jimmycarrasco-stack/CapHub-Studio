import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { contactName, listContacts, listLocationTags, listTasks } from "@/lib/crm/contacts";
import { cx } from "@/lib/format";
import { pageCtx } from "@/lib/page-ctx";
import { ContactsTable } from "./contacts-table";
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
            <ContactsTable
              rows={contacts.map((c) => ({ id: c.id, name: contactName(c), company: c.company, email: c.email, phone: c.phone, tags: c.tags, created_at: c.created_at }))}
              total={total}
              rangeLabel={`${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + contacts.length} of ${total.toLocaleString()}`}
              prevHref={page > 1 ? qs(page - 1) : null}
              nextHref={page * PAGE < total ? qs(page + 1) : null}
              q={q ?? ""}
              tag={tag ?? ""}
              isAdmin={ctx.role === "admin"}
              allTags={tags}
            />
          )}
        </>
      )}
    </div>
  );
}
