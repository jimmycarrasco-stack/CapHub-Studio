"use client";

import { useState } from "react";
import { api, Button, Field, Input } from "@/components/ui";

export function SetPasswordForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/set-password", { method: "POST", json: { token, password: pw } });
      // Full navigation so the new session cookie is used everywhere.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pw.length >= 10 && !mismatch) void submit();
      }}
    >
      <Field label="New password" hint="At least 10 characters." htmlFor="pw">
        <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="pw2">
        <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      {mismatch && <p className="text-sm text-red-600">Passwords don&apos;t match.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={pw.length < 10 || pw !== pw2}>
        Set password &amp; sign in
      </Button>
    </form>
  );
}
