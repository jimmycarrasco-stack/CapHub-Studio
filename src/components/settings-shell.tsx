import Link from "next/link";
import { cx } from "@/lib/format";
import { PageHeader } from "./ui";

/** Shared header + tabs for the settings pages. */
export function SettingsShell({ active, isAgencyAdmin, children }: { active: "general" | "team" | "ai"; isAgencyAdmin: boolean; children: React.ReactNode }) {
  const tabs = [
    { k: "general", href: "/settings", label: "Business & integrations" },
    { k: "team", href: "/settings/team", label: "Team" },
    ...(isAgencyAdmin ? [{ k: "ai", href: "/settings/ai", label: "AI & runtime (agency)" }] : []),
  ];
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <PageHeader title="Settings" />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200" aria-label="Settings sections">
        {tabs.map((t) => (
          <Link
            key={t.k}
            href={t.href}
            aria-current={active === t.k ? "page" : undefined}
            className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium", active === t.k ? "border-brand-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
