import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { listApps } from "@/lib/apps/repo";
import { NewAppForm } from "./new-app-form";

export const metadata = { title: "App Builder" };

export default function AppsPage() {
  const apps = listApps();
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader
        title="App Builder"
        subtitle="Describe a full-stack web app — accounts, database, admin panel and all. AI writes the code, runs it in an isolated container, and keeps iterating with you."
      />
      <NewAppForm />

      <h2 className="mt-10 mb-3 text-sm font-semibold text-zinc-900">Your apps</h2>
      {apps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">No apps yet. Describe one above to get started.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <Link key={a.id} href={`/apps/${a.id}`} className="group rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-zinc-300">
              <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-brand-700">{a.name}</h3>
              <p className="mt-1 font-mono text-xs text-zinc-400">Next.js · Postgres · :{a.port}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>{a.github_repo ? `GitHub: ${a.github_repo}` : "Not on GitHub yet"}</span>
                <span>{timeAgo(a.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
