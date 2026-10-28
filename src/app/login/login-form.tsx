"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      const next = params.get("next");
      // Only same-site relative redirects. Full reload so the server picks up the new session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoFocus autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" className="w-full" loading={loading} disabled={!email || !password}>
        Sign in
      </Button>
      <p className="text-center text-xs text-zinc-500">Forgot your password? Ask your agency admin to reset it.</p>
    </form>
  );
}
