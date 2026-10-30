"use client";

import { useState } from "react";
import { api, Badge, Button, Card, EmptyState, Field, Input, Select, toast } from "@/components/ui";

interface DomainRow {
  domain: string;
  target_type: "site" | "funnel";
  target_id: string;
  target_name?: string | null;
  verify_token: string;
  verified_at: string | null;
}

type Check = { verified: boolean; txtError: string | null; pointsTo: string[] };

const isRootDomain = (d: string) => d.split(".").length === 2;

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast("Copied", "success"),
    () => toast(text),
  );
}

function TargetSelect({
  value,
  onChange,
  sites,
  funnels,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  sites: { id: string; name: string; published: boolean }[];
  funnels: { id: string; name: string }[];
  id?: string;
}) {
  return (
    <Select id={id} aria-label="Show this page" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a site or funnel…</option>
      {funnels.length > 0 && (
        <optgroup label="Funnels">
          {funnels.map((f) => (
            <option key={f.id} value={`funnel:${f.id}`}>
              {f.name}
            </option>
          ))}
        </optgroup>
      )}
      {sites.length > 0 && (
        <optgroup label="Sites">
          {sites.map((s) => (
            <option key={s.id} value={`site:${s.id}`}>
              {s.name}
              {s.published ? "" : " (not published)"}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

export function Domains({
  initial,
  sites,
  funnels,
  appHost,
  canEdit,
  isAgencyAdmin,
}: {
  initial: DomainRow[];
  sites: { id: string; name: string; published: boolean }[];
  funnels: { id: string; name: string }[];
  appHost: string | null;
  canEdit: boolean;
  isAgencyAdmin: boolean;
}) {
  const [domains, setDomains] = useState(initial);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [domain, setDomain] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    const [targetType, targetId] = target.split(":");
    setBusy("add");
    try {
      const d = await api<DomainRow>("/api/domains", { method: "POST", json: { domain, targetType, targetId } });
      setDomains([...domains, d]);
      setDomain("");
      setTarget("");
      toast("Domain added — now add the DNS records below", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function verify(d: DomainRow) {
    setBusy(`v:${d.domain}`);
    try {
      const r = await api<Check & { domain: DomainRow }>(`/api/domains/${encodeURIComponent(d.domain)}/verify`, { method: "POST" });
      setChecks({ ...checks, [d.domain]: r });
      setDomains(domains.map((x) => (x.domain === d.domain ? r.domain : x)));
      toast(r.verified ? `${d.domain} is verified` : "Not verified yet", r.verified ? "success" : "info");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function retarget(d: DomainRow, value: string) {
    const [targetType, targetId] = value.split(":");
    if (!targetId) return;
    try {
      const r = await api<DomainRow>(`/api/domains/${encodeURIComponent(d.domain)}`, { method: "PATCH", json: { targetType, targetId } });
      setDomains(domains.map((x) => (x.domain === d.domain ? r : x)));
      toast("Updated", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(d: DomainRow) {
    if (!window.confirm(`Disconnect ${d.domain}? Visitors to it will stop seeing your page.`)) return;
    try {
      await api(`/api/domains/${encodeURIComponent(d.domain)}`, { method: "DELETE" });
      setDomains(domains.filter((x) => x.domain !== d.domain));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-6">
      {!appHost && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong className="font-semibold">CapHub isn&apos;t online yet.</strong> Custom domains work once CapHub runs on an internet-facing server with its address set as{" "}
          <code className="rounded bg-amber-100 px-1">PUBLIC_BASE_URL</code>. You can connect and verify domains now; they&apos;ll start serving once the server is live.
          {isAgencyAdmin ? " Server setup is at the bottom of this page." : ""}
        </div>
      )}

      {canEdit && (
        <Card className="p-4">
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (domain.trim() && target) void add();
            }}
          >
            <Field label="Domain" htmlFor="dm-domain">
              <Input id="dm-domain" placeholder="book.yourbusiness.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </Field>
            <Field label="Shows" htmlFor="dm-target">
              <TargetSelect id="dm-target" value={target} onChange={setTarget} sites={sites} funnels={funnels} />
            </Field>
            <Button type="submit" variant="primary" loading={busy === "add"} disabled={!domain.trim() || !target}>
              Connect domain
            </Button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">A site shows at the domain&apos;s home page. A funnel starts there and continues at /2, /3… Use a subdomain (like book. or go.) to keep your main website where it is.</p>
        </Card>
      )}

      {domains.length === 0 ? (
        <EmptyState title="No custom domains yet">Connect a domain above, then add two DNS records at your domain provider (GoDaddy, Namecheap, Cloudflare…).</EmptyState>
      ) : (
        domains.map((d) => {
          const c = checks[d.domain];
          const root = isRootDomain(d.domain);
          return (
            <Card key={d.domain} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="font-semibold text-zinc-900 hover:text-brand-700">
                      {d.domain}
                    </a>
                    {d.verified_at ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Waiting for DNS</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Shows {d.target_type}: <span className="font-medium text-zinc-700">{d.target_name ?? "(deleted)"}</span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-56">
                      <TargetSelect value={`${d.target_type}:${d.target_id}`} onChange={(v) => retarget(d, v)} sites={sites} funnels={funnels} />
                    </div>
                    <Button size="sm" loading={busy === `v:${d.domain}`} onClick={() => verify(d)}>
                      {d.verified_at ? "Re-check DNS" : "Verify"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-[13px] font-medium text-zinc-700">DNS records to add at your domain provider</div>
                <div className="overflow-x-auto rounded-lg ring-1 ring-zinc-200">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Name / Host</th>
                        <th className="px-3 py-2">Value / Points to</th>
                        <th className="px-3 py-2">Purpose</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-mono text-xs">
                      <tr>
                        <td className="px-3 py-2">TXT</td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => copy(`_caphub.${d.domain}`)} className="hover:text-brand-700" title="Copy">
                            _caphub.{d.domain}
                          </button>
                        </td>
                        <td className="px-3 py-2 break-all">
                          <button type="button" onClick={() => copy(`caphub-verify=${d.verify_token}`)} className="text-left hover:text-brand-700" title="Copy">
                            caphub-verify={d.verify_token}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-sans text-zinc-500">Proves you own it</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2">{root ? "A" : "CNAME"}</td>
                        <td className="px-3 py-2">{root ? "@" : d.domain.split(".")[0]}</td>
                        <td className="px-3 py-2">
                          {root ? (
                            <span className="font-sans text-zinc-600">your CapHub server&apos;s IP address</span>
                          ) : appHost ? (
                            <button type="button" onClick={() => copy(appHost)} className="hover:text-brand-700" title="Copy">
                              {appHost}
                            </button>
                          ) : (
                            <span className="font-sans text-zinc-600">your CapHub server&apos;s address</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-sans text-zinc-500">Sends visitors to CapHub</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Some providers want just <code>_caphub</code>{root ? "" : `.${d.domain.split(".")[0]}`} in the Name field (they add the rest). DNS changes usually take a few minutes, sometimes up to an hour. HTTPS is set up
                  automatically once it&apos;s verified and pointing here.
                </p>
              </div>

              {c && (
                <div className="space-y-1 rounded-lg bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
                  <div>{c.verified ? "✓ Ownership verified" : `✕ ${c.txtError ?? "Not verified yet"}`}</div>
                  <div className="text-zinc-600">{c.pointsTo.length ? `Currently points to: ${c.pointsTo.join(", ")}` : "It doesn't point anywhere yet."}</div>
                </div>
              )}
            </Card>
          );
        })
      )}

      {isAgencyAdmin && <ServerSetup appHost={appHost} />}
    </div>
  );
}

function ServerSetup({ appHost }: { appHost: string | null }) {
  const caddy = `{
  on_demand_tls {
    ask http://localhost:3000/api/public/domains/ask
  }
}

# CapHub itself
${appHost ?? "studio.youragency.com"} {
  reverse_proxy localhost:3000
}

# Every verified customer domain (certificates are issued automatically)
https:// {
  tls {
    on_demand
  }
  reverse_proxy localhost:3000
}`;
  return (
    <details className="rounded-xl bg-white p-5 ring-1 ring-zinc-200">
      <summary className="cursor-pointer text-sm font-semibold">Server setup for custom domains (agency admins)</summary>
      <div className="mt-3 space-y-3 text-sm text-zinc-600">
        <p>Custom domains need CapHub on a server with a public IP address (a VPS, or a Mac mini with ports 80/443 forwarded), plus Caddy in front of it for automatic HTTPS:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Set <code>PUBLIC_BASE_URL</code> in <code>.env.local</code> to CapHub&apos;s own address (e.g. <code>https://studio.youragency.com</code>) and restart.
          </li>
          <li>
            Install Caddy (<code>brew install caddy</code> or your server&apos;s package manager) and use this Caddyfile. Caddy only gets certificates for domains CapHub says are verified.
          </li>
          <li>Point your customers&apos; CNAME records at CapHub&apos;s address (or A records at the server&apos;s IP).</li>
        </ol>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">{caddy}</pre>
          <Button size="sm" className="absolute top-2 right-2" onClick={() => copy(caddy)}>
            Copy
          </Button>
        </div>
      </div>
    </details>
  );
}
