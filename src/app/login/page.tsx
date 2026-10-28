"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, Button, Input } from "@/components/ui";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: { password } });
      const next = params.get("next");
      // Only allow same-site relative redirects.
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-2 flex items-center gap-2.5">
        <Logo />
        <div>
          <h1 className="text-base font-semibold text-zinc-900">CapHub Studio</h1>
          <p className="text-xs text-zinc-500">Admin sign in</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-[13px] font-medium text-zinc-700">
          Password
        </label>
        <Input id="password" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button variant="primary" className="w-full" loading={loading} disabled={!password}>
        Sign in
      </Button>
    </form>
  );
}

function Logo() {
  return (
    <div className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-full place-items-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
