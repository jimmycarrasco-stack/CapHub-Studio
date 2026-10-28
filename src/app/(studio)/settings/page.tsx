import { SettingsShell } from "@/components/settings-shell";
import { smtpStatus } from "@/lib/crm/email";
import { stripeStatus } from "@/lib/crm/payments";
import { pageCtx } from "@/lib/page-ctx";
import { baseUrlFromHeaders } from "@/lib/request-url";
import { BusinessProfile, EmailSettings, StripeSettings } from "./account-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await pageCtx("admin");
  const loc = ctx.location;
  return (
    <SettingsShell active="general" isAgencyAdmin={ctx.isAgencyAdmin}>
      <div className="space-y-6">
        <BusinessProfile initial={{ name: loc.name, email: loc.email, phone: loc.phone, website: loc.website, timezone: loc.timezone }} />
        <StripeSettings initial={stripeStatus(loc.id)} webhookUrl={`${await baseUrlFromHeaders()}/api/webhooks/stripe/${loc.id}`} />
        <EmailSettings initial={smtpStatus(loc.id)} userEmail={ctx.user.email} />
      </div>
    </SettingsShell>
  );
}
