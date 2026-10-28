import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";

export async function Nav() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-zinc-200 bg-white">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold">
          My App
        </Link>
        <div className="flex flex-1 items-center gap-4 text-sm text-zinc-600">
          {user && <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>}
          {user?.role === "admin" && <Link href="/admin" className="hover:text-zinc-900">Admin</Link>}
        </div>
        {user ? (
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-500 sm:inline">{user.email}</span>
            <button className="rounded-md px-3 py-1.5 ring-1 ring-zinc-200 hover:bg-zinc-50">Log out</button>
          </form>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-md px-3 py-1.5 hover:bg-zinc-100">Log in</Link>
            <Link href="/signup" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700">Sign up</Link>
          </div>
        )}
      </nav>
    </header>
  );
}
