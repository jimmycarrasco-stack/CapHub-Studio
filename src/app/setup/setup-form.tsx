"use client";

import { useState } from "react";
import { api, Button, Field, Input } from "@/components/ui";

export function SetupForm({ hasLocations }: { hasLocations: boolean }) {
  const [f, setF] = useState({ setupKey: "", name: "", email: "", password: "", locationName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/setup", { method: "POST", json: { ...f, locationName: f.locationName || undefined } });
      window.location.assign("/");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-zinc-600">
        You&apos;re the first person here. Create your owner login — you&apos;ll manage the agency and all client sub-accounts.
      </p>
      <Field label="Setup key" htmlFor="key" hint="The ADMIN_PASSWORD value in .env.local (proves you control this server).">
        <Input id="key" type="password" required autoComplete="off" value={f.setupKey} onChange={set("setupKey")} />
      </Field>
      <Field label="Your name" htmlFor="name">
        <Input id="name" required autoComplete="name" value={f.name} onChange={set("name")} />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} />
      </Field>
      <Field label="Password" htmlFor="pw" hint="At least 8 characters.">
        <Input id="pw" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set("password")} />
      </Field>
      {!hasLocations && (
        <Field label="First sub-account name" htmlFor="loc" hint="Your business or your first client. You can add more later.">
          <Input id="loc" placeholder="e.g. CapHub Marketing" value={f.locationName} onChange={set("locationName")} />
        </Field>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" className="w-full" loading={loading}>
        Create owner account
      </Button>
    </form>
  );
}
