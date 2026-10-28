import { getAiSettings } from "@/lib/settings";
import { ProviderSettings } from "./provider-settings";

export const metadata = { title: "AI Providers" };

export default function SettingsPage() {
  return <ProviderSettings initial={getAiSettings()} />;
}
