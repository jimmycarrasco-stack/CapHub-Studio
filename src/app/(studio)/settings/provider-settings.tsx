"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Badge, Button, Card, cx, Field, Input, toast } from "@/components/ui";
import { ENV_KEYS, MODEL_SUGGESTIONS, PROVIDER_LABELS, PROVIDERS, type ProviderName } from "@/lib/llm/catalog";
import type { AiSettings } from "@/lib/settings";
import { RuntimeSettings } from "./runtime-settings";

export function ProviderSettings({ initial }: { initial: AiSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [models, setModels] = useState<Record<ProviderName, string>>({
    anthropic: initial.providers.anthropic.model,
    openai: initial.providers.openai.model,
  });
  const [keys, setKeys] = useState<Record<ProviderName, string>>({ anthropic: "", openai: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<ProviderName | null>(null);

  async function save(update: unknown, label: string) {
    setSaving(label);
    try {
      const next = await api<AiSettings>("/api/settings", { method: "PUT", json: update });
      setSettings(next);
      router.refresh(); // update sidebar "Active AI"
      return next;
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(null);
    }
  }

  async function activate(p: ProviderName) {
    if (p === settings.activeProvider) return;
    if (await save({ activeProvider: p }, `activate-${p}`)) toast(`${PROVIDER_LABELS[p]} is now the active provider`, "success");
  }

  async function saveProvider(p: ProviderName) {
    const patch: { model: string; apiKey?: string } = { model: models[p] };
    if (keys[p].trim()) patch.apiKey = keys[p].trim();
    if (await save({ providers: { [p]: patch } }, `save-${p}`)) {
      setKeys((k) => ({ ...k, [p]: "" }));
      toast(`${PROVIDER_LABELS[p]} settings saved`, "success");
    }
  }

  async function removeKey(p: ProviderName) {
    if (!confirm(`Remove the ${PROVIDER_LABELS[p]} API key saved in settings? (A key in .env.local, if any, will be used instead.)`)) return;
    if (await save({ providers: { [p]: { apiKey: null } } }, `remove-${p}`)) toast("Stored key removed", "success");
  }

  async function test(p: ProviderName) {
    setTesting(p);
    try {
      const r = await api<{ model: string; ms: number; reply: string }>("/api/settings/test", { method: "POST", json: { provider: p } });
      toast(`${PROVIDER_LABELS[p]} OK — ${r.model} replied in ${(r.ms / 1000).toFixed(1)}s`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setTesting(null);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-500">
        Agency-wide: choose which provider powers the AI Guide, Site Builder, App Builder, agents and AI-written emails in every sub-account. Switch any time — the change applies to the next request.
      </p>

      <Card className="mb-6 p-4">
        <div className="mb-3 text-[13px] font-medium text-zinc-700">Active provider</div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Active provider">
          {PROVIDERS.map((p) => {
            const on = settings.activeProvider === p;
            const hasKey = settings.providers[p].keySource !== "none";
            return (
              <button
                key={p}
                role="radio"
                aria-checked={on}
                onClick={() => activate(p)}
                disabled={saving !== null}
                className={cx(
                  "flex items-center justify-between rounded-lg px-4 py-3 text-left ring-1 transition",
                  on ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-zinc-200 hover:ring-zinc-300",
                )}
              >
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{PROVIDER_LABELS[p]}</div>
                  <div className="font-mono text-xs text-zinc-500">{settings.providers[p].model}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!hasKey && <Badge tone="amber">No key</Badge>}
                  <span className={cx("grid size-4 place-items-center rounded-full ring-2", on ? "ring-brand-600" : "ring-zinc-300")}>
                    {on && <span className="size-2 rounded-full bg-brand-600" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Agents use the active provider unless you pin a specific provider on the agent itself (Agent Studio → Model).
        </p>
      </Card>

      <div className="space-y-6">
        {PROVIDERS.map((p) => {
          const st = settings.providers[p];
          return (
            <Card key={p} className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">{PROVIDER_LABELS[p]}</h2>
                {st.keySource === "settings" && <Badge tone="green">Key saved in settings · ••••{st.keyHint}</Badge>}
                {st.keySource === "env" && <Badge tone="brand">Key from {ENV_KEYS[p]} · ••••{st.keyHint}</Badge>}
                {st.keySource === "none" && <Badge tone="amber">No API key</Badge>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Model ID" htmlFor={`${p}-model`} hint={<>Suggestions: {MODEL_SUGGESTIONS[p].join(", ")}</>}>
                  <Input
                    id={`${p}-model`}
                    list={`${p}-models`}
                    className="font-mono"
                    value={models[p]}
                    onChange={(e) => setModels((m) => ({ ...m, [p]: e.target.value }))}
                  />
                  <datalist id={`${p}-models`}>
                    {MODEL_SUGGESTIONS[p].map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  label={st.keySource === "none" ? "API key" : "Replace API key"}
                  htmlFor={`${p}-key`}
                  hint="Encrypted with APP_SECRET before it's stored. Never shown again after saving."
                >
                  <Input
                    id={`${p}-key`}
                    type="password"
                    autoComplete="off"
                    placeholder={p === "anthropic" ? "sk-ant-…" : "sk-…"}
                    value={keys[p]}
                    onChange={(e) => setKeys((k) => ({ ...k, [p]: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" loading={saving === `save-${p}`} onClick={() => saveProvider(p)}>
                  Save
                </Button>
                <Button size="sm" loading={testing === p} disabled={st.keySource === "none"} onClick={() => test(p)}>
                  Test connection
                </Button>
                {st.keySource === "settings" && (
                  <Button size="sm" variant="danger" loading={saving === `remove-${p}`} onClick={() => removeKey(p)}>
                    Remove stored key
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <RuntimeSettings />
    </div>
  );
}
