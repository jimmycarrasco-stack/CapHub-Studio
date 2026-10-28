import { requireUser } from "@/lib/auth";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hi, {user.name}</h1>
        <p className="text-zinc-600">You&apos;re signed in as {user.email} ({user.role}).</p>
      </div>
      <div className="rounded-xl bg-white p-6 ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">This is your dashboard. Your app&apos;s main features go here.</p>
      </div>
    </div>
  );
}
