import { SettingsShell } from "@/components/settings-shell";
import { agencyPage } from "@/lib/page-ctx";
import { getAiSettings } from "@/lib/settings";
import { ProviderSettings } from "../provider-settings";

export const metadata = { title: "AI & runtime" };

export default async function AiSettingsPage() {
  await agencyPage();
  return (
    <SettingsShell active="ai" isAgencyAdmin>
      <ProviderSettings initial={getAiSettings()} />
    </SettingsShell>
  );
}
