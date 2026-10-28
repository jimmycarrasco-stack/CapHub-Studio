"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api, cx, toast } from "./ui";

type NavItem = { href: string; label: string; icon: string; match?: string[] };

const I = {
  home: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  contacts: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  pipeline: "M3 3h4v18H3zM10 3h4v12h-4zM17 3h4v8h-4z",
  card: "M2 5h20v14H2zM2 10h20",
  zap: "M13 2L3 14h9l-1 8 10-12h-9z",
  site: "M4 5h16v14H4zM4 9h16M8 5v4",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  bot: "M12 8V4H8M4 12a8 8 0 0 0 16 0v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3zM9 13h.01M15 13h.01",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1",
};

const GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Dashboard", icon: I.home }] },
  {
    label: "CRM",
    items: [
      { href: "/contacts", label: "Contacts", icon: I.contacts },
      { href: "/conversations", label: "Conversations", icon: I.chat },
      { href: "/pipelines", label: "Pipelines", icon: I.pipeline },
      { href: "/payments", label: "Payments", icon: I.card },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/automations", label: "Automations", icon: I.zap },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/sites", label: "Sites & Funnels", icon: I.site, match: ["/sites", "/funnels"] },
      { href: "/apps", label: "App Builder", icon: I.code },
      { href: "/agents", label: "AI Agents", icon: I.bot },
    ],
  },
];

export interface SidebarProps {
  user: { name: string; email: string; isAgencyAdmin: boolean; isAdmin: boolean };
  location: { id: string; name: string };
  locations: { id: string; name: string }[];
}

export function Sidebar({ user, location, locations }: SidebarProps) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = (n: NavItem) => (n.href === "/" ? path === "/" : (n.match ?? [n.href]).some((m) => path === m || path.startsWith(m + "/")));

  async function switchTo(id: string) {
    setOpen(false);
    if (id === location.id) return;
    try {
      await api("/api/auth/switch", { method: "POST", json: { locationId: id } });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const link = (n: NavItem) => (
    <Link
      key={n.href}
      href={n.href}
      aria-current={active(n) ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
        active(n) ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={n.icon} />
      </svg>
      {n.label}
    </Link>
  );

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-zinc-200 bg-white md:h-full md:w-60 md:border-r md:border-b-0">
      {/* Sub-account switcher */}
      <div className="relative border-b border-zinc-100 p-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-50"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-semibold text-white">{location.name.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-zinc-900">{location.name}</span>
            <span className="block text-[11px] text-zinc-500">Switch sub-account</span>
          </span>
          <span className="text-xs text-zinc-400">▾</span>
        </button>
        {open && (
          <div className="absolute inset-x-3 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-zinc-200" role="listbox">
            {locations.map((l) => (
              <button
                key={l.id}
                role="option"
                aria-selected={l.id === location.id}
                onClick={() => switchTo(l.id)}
                className={cx("block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50", l.id === location.id && "font-semibold text-brand-700")}
              >
                {l.name}
              </button>
            ))}
            {user.isAgencyAdmin && (
              <Link href="/agency" onClick={() => setOpen(false)} className="mt-1 block border-t border-zinc-100 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-zinc-50">
                + Manage sub-accounts
              </Link>
            )}
          </div>
        )}
      </div>

      <nav className="flex flex-1 gap-0.5 overflow-x-auto p-3 md:flex-col md:overflow-y-auto">
        {GROUPS.map((g, i) => (
          <div key={i} className="flex gap-0.5 md:mb-3 md:flex-col">
            {g.label && <div className="hidden px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase md:block">{g.label}</div>}
            {g.items.map(link)}
          </div>
        ))}
        <div className="flex gap-0.5 md:hidden">
          {user.isAdmin && link({ href: "/settings", label: "Settings", icon: I.cog })}
          {user.isAgencyAdmin && link({ href: "/agency", label: "Agency", icon: I.building })}
          <button onClick={logout} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-zinc-600 hover:bg-zinc-100">
            Sign out
          </button>
        </div>
      </nav>

      <div className="hidden space-y-0.5 border-t border-zinc-100 p-3 md:block">
        {user.isAdmin && link({ href: "/settings", label: "Settings", icon: I.cog })}
        {user.isAgencyAdmin && link({ href: "/agency", label: "Agency", icon: I.building })}
        <div className="mt-2 flex items-center justify-between gap-2 px-2.5 pt-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-zinc-800">{user.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{user.email}</div>
          </div>
          <button onClick={logout} className="shrink-0 rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
