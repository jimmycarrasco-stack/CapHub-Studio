import Link from "next/link";
import { cx } from "@/lib/format";

/** Sites / Funnels switcher shown at the top of both pages. */
export function BuildTabs({ active }: { active: "sites" | "funnels" | "domains" }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-zinc-200">
      {(
        [
          ["sites", "/sites", "Sites & pages"],
          ["funnels", "/funnels", "Funnels"],
          ["domains", "/domains", "Domains"],
        ] as const
      ).map(([k, href, label]) => (
        <Link
          key={k}
          href={href}
          className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", active === k ? "border-brand-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
