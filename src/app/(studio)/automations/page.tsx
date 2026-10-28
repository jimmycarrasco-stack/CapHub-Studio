import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { describeStep, TRIGGERS } from "@/lib/crm/automation-defs";
import { listAutomations } from "@/lib/crm/automations";
import { timeAgo } from "@/lib/format";
import { pageCtx } from "@/lib/page-ctx";
import { OpenGuideButton } from "@/components/guide";

export const metadata = { title: "Automations" };

const TEMPLATES = [
  "When someone submits a form on my site, tag them 'lead', email them a friendly thank-you, and create a follow-up task for tomorrow",
  "When a payment is received, tag the contact 'customer' and send an AI-written welcome email",
  "When a deal is marked won, email the team and add the contact to an onboarding pipeline",
];

export default async function AutomationsPage() {
  const ctx = await pageCtx();
  const list = listAutomations(ctx.location.id);
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader
        title="Automations"
        subtitle="When something happens, do things automatically — send emails, tag contacts, move deals, create tasks."
        actions={
          <div className="flex gap-2">
            <OpenGuideButton prompt="Help me build an automation. Ask me what should trigger it and what it should do.">Build with AI</OpenGuideButton>
            <Link href="/automations/new" className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
              New automation
            </Link>
          </div>
        }
      />
      {list.length === 0 ? (
        <EmptyState title="No automations yet" action={<div className="mx-auto flex max-w-lg flex-col gap-2">{TEMPLATES.map((t) => <OpenGuideButton key={t} prompt={`Build this automation: ${t}`}>{t}</OpenGuideButton>)}</div>}>
          Start from scratch, or click an idea below and the AI Guide will build it for you.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
          {list.map((a) => (
            <li key={a.id}>
              <Link href={`/automations/${a.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-zinc-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{a.name}</span>
                    {a.enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">
                    <span className="font-medium text-zinc-700">{TRIGGERS[a.trigger.type].label}</span>
                    {a.steps.length > 0 && " → "}
                    {a.steps.map(describeStep).join(" → ")}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-zinc-500">
                  <div>
                    {a.run_count} run{a.run_count === 1 ? "" : "s"}
                    {a.active_count ? ` · ${a.active_count} in progress` : ""}
                  </div>
                  <div className="text-zinc-400">edited {timeAgo(a.updated_at)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
