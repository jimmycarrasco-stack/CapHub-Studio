"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Badge, Button, Card, Field, Input, Spinner, toast } from "@/components/ui";

type Runtime = {
  docker: { available: boolean; version: string | null; error: string | null };
  postgres: string;
  appImage: string;
  pgImage: string;
  github: { source: "settings" | "env" | "none"; hint: string | null };
};

export function RuntimeSettings() {
  const [rt, setRt] = useState<Runtime | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<Runtime>("/api/system/runtime").then(setRt).catch((e) => toast(e.message, "error")), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveToken(value: string | null) {
    setSaving(true);
    try {
      await api("/api/system/runtime", { method: "PUT", json: { githubToken: value } });
      setToken("");
      toast(value ? "GitHub token saved" : "GitHub token removed", "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-10 space-y-6">
      <h2 className="text-base font-semibold text-zinc-900">App Builder</h2>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Runtime (Docker)</h3>
          <Button size="sm" variant="ghost" onClick={() => load()}>
            Recheck
          </Button>
        </div>
        {!rt ? (
          <Spinner />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-zinc-500">Docker</dt>
            <dd>{rt.docker.available ? <Badge tone="green">Running · v{rt.docker.version}</Badge> : <span className="text-red-700">{rt.docker.error}</span>}</dd>
            <dt className="text-zinc-500">Shared Postgres</dt>
            <dd>
              {rt.postgres === "running" ? (
                <Badge tone="green">Running</Badge>
              ) : rt.postgres === "missing" ? (
                <span className="text-zinc-600">Created automatically when you start your first app</span>
              ) : (
                <Badge tone="amber">{rt.postgres}</Badge>
              )}
            </dd>
            <dt className="text-zinc-500">Images</dt>
            <dd className="font-mono text-xs text-zinc-600">
              {rt.appImage} · {rt.pgImage}
            </dd>
          </dl>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Each app runs in its own container with its own database. The first app start downloads the images (~300 MB) and can take a few minutes.
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">GitHub</h3>
          {rt?.github.source === "settings" && <Badge tone="green">Token saved · ••••{rt.github.hint}</Badge>}
          {rt?.github.source === "env" && <Badge tone="brand">Token from GITHUB_TOKEN · ••••{rt.github.hint}</Badge>}
          {rt?.github.source === "none" && <Badge tone="amber">No token</Badge>}
        </div>
        <Field
          label={rt?.github.source === "none" ? "Personal access token" : "Replace token"}
          htmlFor="gh-token"
          hint={
            <>
              Used to push apps to GitHub. Create a fine-grained token at github.com → Settings → Developer settings with <strong>Contents: read &amp; write</strong>{" "}
              and <strong>Administration: read &amp; write</strong> (to create repos). Encrypted before it&apos;s stored.
            </>
          }
        >
          <Input id="gh-token" type="password" autoComplete="off" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" disabled={!token.trim()} loading={saving} onClick={() => saveToken(token.trim())}>
            Save token
          </Button>
          {rt?.github.source === "settings" && (
            <Button size="sm" variant="danger" onClick={() => window.confirm("Remove the saved GitHub token?") && saveToken(null)}>
              Remove
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
