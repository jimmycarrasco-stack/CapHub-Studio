import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/llm/catalog";
import { pageCtx } from "@/lib/page-ctx";
import { listAgents } from "@/lib/repo";
import { NewAgentForm } from "./new-agent-form";

export const metadata = { title: "Agent Studio" };

export default async function AgentsPage() {
  const ctx = await pageCtx();
  const agents = listAgents(ctx.location.id);
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader
        title="Agent Studio"
        subtitle="Create AI chat agents with their own instructions and knowledge, test them, then embed them on your sites or anywhere."
      />
      <NewAgentForm />

      <h2 className="mt-10 mb-3 text-sm font-semibold text-zinc-900">Your agents</h2>
      {agents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">No agents yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <Link key={a.id} href={`/agents/${a.id}`} className="group rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-zinc-300">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.widget_color }} />
                  <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-brand-700">{a.name}</h3>
                </div>
                {a.widget_enabled ? <Badge tone="green">Widget live</Badge> : <Badge>Widget off</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 min-h-8 text-xs text-zinc-500">{a.description || "No description"}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {a.knowledge_count} doc{a.knowledge_count === 1 ? "" : "s"} · {a.conversation_count} chat{a.conversation_count === 1 ? "" : "s"}
                </span>
                <span>{a.provider === "default" ? "Active provider" : PROVIDER_LABELS[a.provider]}</span>
              </div>
              <div className="mt-1 text-right text-[11px] text-zinc-400">{timeAgo(a.updated_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
