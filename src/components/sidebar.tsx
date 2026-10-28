"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/sites", label: "Site Builder", icon: "M4 5h16v14H4zM4 9h16M8 5v4" },
  { href: "/apps", label: "App Builder", icon: "M16 18l6-6-6-6M8 6l-6 6 6 6" },
  { href: "/agents", label: "Agent Studio", icon: "M12 8V4H8M4 12a8 8 0 0 0 16 0v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3zM9 13h.01M15 13h.01" },
  { href: "/settings", label: "AI Providers", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

export function Sidebar({ provider }: { provider: string }) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-full shrink-0 flex-row items-center gap-1 border-b border-zinc-200 bg-white px-3 py-2 md:h-full md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-4">
      <Link href="/" className="mr-2 flex items-center gap-2 px-2 md:mb-5 md:mr-0">
        <span className="grid size-7 place-items-center rounded-md bg-brand-600 text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          </svg>
        </span>
        <span className="hidden text-sm font-semibold text-zinc-900 sm:inline">CapHub Studio</span>
      </Link>
      <nav className="flex flex-1 flex-row gap-0.5 overflow-x-auto md:flex-col">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              active(n.href) ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={n.icon} />
            </svg>
            <span className="hidden sm:inline">{n.label}</span>
          </Link>
        ))}
      </nav>
      <div className="hidden space-y-2 border-t border-zinc-100 pt-3 md:block">
        <Link href="/settings" className="block rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50">
          Active AI: <span className="font-medium text-zinc-800">{provider}</span>
        </Link>
        <button onClick={logout} className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800">
          Sign out
        </button>
      </div>
      <button onClick={logout} className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 md:hidden">
        Sign out
      </button>
    </aside>
  );
}
