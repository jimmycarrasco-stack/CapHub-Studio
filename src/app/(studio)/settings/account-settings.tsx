"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Badge, Button, Card, Field, Input, Select, toast, Toggle } from "@/components/ui";

function Section({ id, title, description, badge, children }: { id?: string; title: string; description: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="scroll-mt-6 p-5">
      <section id={id} aria-labelledby={`${id ?? title}-h`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id ?? title}-h`} className="text-sm font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
          </div>
          {badge}
        </div>
        {children}
      </section>
    </Card>
  );
}

const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["America/Winnipeg"];

export function BusinessProfile({ initial }: { initial: { name: string; email: string; phone: string; website: string; timezone: string } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try {
      await api("/api/account/profile", { method: "PATCH", json: f });
      toast("Saved", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section id="profile" title="Business profile" description="Used in emails ({{business.name}}), team notifications and the AI Guide.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name" htmlFor="bp-name">
          <Input id="bp-name" value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Team email" hint="Where 'Notify team' automation steps go" htmlFor="bp-email">
          <Input id="bp-email" type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Phone" htmlFor="bp-phone">
          <Input id="bp-phone" type="tel" value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="Website" htmlFor="bp-web">
          <Input id="bp-web" value={f.website} onChange={set("website")} placeholder="https://" />
        </Field>
        <Field label="Time zone" htmlFor="bp-tz">
          <Select id="bp-tz" value={f.timezone} onChange={set("timezone")}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" loading={busy} disabled={!f.name.trim() || JSON.stringify(f) === JSON.stringify(initial)} onClick={save}>
          Save
        </Button>
      </div>
    </Section>
  );
}

type StripeState = { connected: boolean; mode: string | null; keyHint: string | null; webhookConfigured: boolean; accountName: string | null };

export function StripeSettings({ initial, webhookUrl }: { initial: StripeState; webhookUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [key, setKey] = useState("");
  const [whsec, setWhsec] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function put(json: object, label: string) {
    setBusy(label);
    try {
      setS(await api<StripeState>("/api/account/stripe", { method: "PUT", json }));
      setKey("");
      setWhsec("");
      toast(label === "key" ? "Stripe connected" : "Webhook secret saved", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      setS(await api<StripeState>("/api/account/stripe", { method: "DELETE" }));
      setConfirmDisconnect(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      id="stripe"
      title="Stripe payments"
      description="Each sub-account uses its own Stripe account. Payments go straight to that Stripe account."
      badge={s.connected ? <Badge tone={s.mode === "live" ? "green" : "amber"}>{s.mode === "live" ? "Live" : "Test mode"}</Badge> : <Badge>Not connected</Badge>}
    >
      {s.connected ? (
        <div className="space-y-4">
          <p className="text-sm">
            Connected to <strong>{s.accountName}</strong> with key ending <code className="rounded bg-zinc-100 px-1 font-mono text-xs">…{s.keyHint}</code>.
          </p>
          <div className="space-y-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-medium">Webhook (recommended)</div>
              {s.webhookConfigured ? <Badge tone="green">Set</Badge> : <Badge tone="amber">Not set</Badge>}
            </div>
            <p className="text-xs text-zinc-600">
              Records subscription renewals, refunds, and payments even if the buyer closes the tab early. In Stripe: Developers → Webhooks → Add endpoint, paste this URL, and select{" "}
              <code>checkout.session.completed</code>, <code>invoice.paid</code>, <code>charge.refunded</code>, <code>customer.subscription.updated</code> and{" "}
              <code>customer.subscription.deleted</code>. Then paste the signing secret below.
            </p>
            <code className="block rounded bg-white px-2 py-1.5 font-mono text-xs break-all ring-1 ring-zinc-200">{webhookUrl}</code>
            <p className="text-xs text-zinc-500">Stripe can only reach this URL if CapHub Studio is on the internet (not just on your Mac).</p>
            <div className="flex gap-2">
              <Input aria-label="Webhook signing secret" type="password" autoComplete="off" placeholder={s.webhookConfigured ? "Replace signing secret (whsec_…)" : "whsec_…"} value={whsec} onChange={(e) => setWhsec(e.target.value)} />
              <Button loading={busy === "whsec"} disabled={!whsec.trim()} onClick={() => put({ webhookSecret: whsec.trim() }, "whsec")}>
                Save
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="New Stripe secret key" type="password" autoComplete="off" placeholder="Replace key (sk_…)" value={key} onChange={(e) => setKey(e.target.value)} className="max-w-xs" />
            <Button loading={busy === "key"} disabled={!key.trim()} onClick={() => put({ secretKey: key.trim() }, "key")}>
              Replace key
            </Button>
            {confirmDisconnect ? (
              <span className="flex items-center gap-2 text-xs">
                Disconnect? Products stay, but checkout stops working.
                <Button size="sm" variant="danger" loading={busy === "disconnect"} onClick={disconnect}>
                  Disconnect
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
            <li>
              Open{" "}
              <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                Stripe → Developers → API keys
              </a>{" "}
              (use Test mode first to try it out).
            </li>
            <li>Copy the <strong>Secret key</strong> (starts with sk_test_ or sk_live_) — or create a restricted key with write access to Products, Prices and Checkout Sessions.</li>
            <li>Paste it here. It&apos;s stored encrypted and never shown again.</li>
          </ol>
          <div className="flex gap-2">
            <Input aria-label="Stripe secret key" type="password" autoComplete="off" placeholder="sk_test_…" value={key} onChange={(e) => setKey(e.target.value)} />
            <Button variant="primary" loading={busy === "key"} disabled={!key.trim()} onClick={() => put({ secretKey: key.trim() }, "key")}>
              Connect
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

type Smtp = { configured: boolean; host?: string; port?: number; secure?: boolean; user?: string; fromName?: string; fromEmail?: string; passHint?: string | null };

const PRESETS: Record<string, { host: string; port: number; secure: boolean; note: string }> = {
  Gmail: { host: "smtp.gmail.com", port: 465, secure: true, note: "Use your Gmail address and an App Password (Google Account → Security → App passwords)." },
  "Outlook / Microsoft 365": { host: "smtp.office365.com", port: 587, secure: false, note: "Use your Microsoft 365 email and password (SMTP AUTH must be enabled for the mailbox)." },
  SendGrid: { host: "smtp.sendgrid.net", port: 587, secure: false, note: "Username is literally 'apikey'; password is your SendGrid API key." },
  Resend: { host: "smtp.resend.com", port: 465, secure: true, note: "Username is 'resend'; password is your Resend API key." },
  Mailgun: { host: "smtp.mailgun.org", port: 587, secure: false, note: "Use the SMTP credentials from your Mailgun domain settings." },
};

export function EmailSettings({ initial, userEmail }: { initial: Smtp; userEmail: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [f, setF] = useState({
    host: initial.host ?? "",
    port: String(initial.port ?? 587),
    secure: initial.secure ?? false,
    user: initial.user ?? "",
    pass: "",
    fromName: initial.fromName ?? "",
    fromEmail: initial.fromEmail ?? "",
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy("save");
    try {
      setS(await api<Smtp>("/api/account/smtp", { method: "PUT", json: { ...f, port: Number(f.port), pass: f.pass || undefined } }));
      setF({ ...f, pass: "" });
      toast("Email connected", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      await api("/api/account/test-email", { method: "POST" });
      toast(`Test email sent to ${userEmail}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      id="email"
      title="Email sending"
      description="Send from your own address through any SMTP provider. Used by automations, one-off emails and team notifications."
      badge={s.configured ? <Badge tone="green">Connected</Badge> : <Badge>Not set up</Badge>}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setF({ ...f, host: p.host, port: String(p.port), secure: p.secure });
              setNote(p.note);
            }}
            className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
          >
            {k}
          </button>
        ))}
      </div>
      {note && <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SMTP host" htmlFor="sm-host">
          <Input id="sm-host" value={f.host} onChange={set("host")} placeholder="smtp.example.com" />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Port" htmlFor="sm-port">
            <Input id="sm-port" inputMode="numeric" value={f.port} onChange={set("port")} />
          </Field>
          <label className="flex h-9 items-center gap-2 text-sm">
            <Toggle checked={f.secure} onChange={(v) => setF({ ...f, secure: v })} label="Use SSL/TLS" />
            SSL
          </label>
        </div>
        <Field label="Username" htmlFor="sm-user">
          <Input id="sm-user" autoComplete="off" value={f.user} onChange={set("user")} />
        </Field>
        <Field label="Password / API key" hint={s.configured && s.passHint ? `Saved (ends …${s.passHint}). Leave blank to keep it.` : undefined} htmlFor="sm-pass">
          <Input id="sm-pass" type="password" autoComplete="new-password" value={f.pass} onChange={set("pass")} />
        </Field>
        <Field label="From name" htmlFor="sm-fn">
          <Input id="sm-fn" value={f.fromName} onChange={set("fromName")} placeholder="Your Business" />
        </Field>
        <Field label="From email" htmlFor="sm-fe">
          <Input id="sm-fe" type="email" value={f.fromEmail} onChange={set("fromEmail")} placeholder="hello@yourbusiness.com" />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {s.configured && (
          <Button loading={busy === "test"} onClick={test}>
            Send test email
          </Button>
        )}
        <Button variant="primary" loading={busy === "save"} disabled={!f.host.trim() || !f.fromEmail.trim() || !Number(f.port)} onClick={save}>
          Save &amp; verify
        </Button>
      </div>
    </Section>
  );
}
