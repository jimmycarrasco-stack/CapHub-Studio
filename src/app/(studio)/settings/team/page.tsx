import { SettingsShell } from "@/components/settings-shell";
import { listLocationTeam } from "@/lib/auth";
import { pageCtx } from "@/lib/page-ctx";
import { Team } from "./team";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await pageCtx("admin");
  return (
    <SettingsShell active="team" isAgencyAdmin={ctx.isAgencyAdmin}>
      <Team initial={listLocationTeam(ctx.location.id)} me={ctx.user.id} locationName={ctx.location.name} />
    </SettingsShell>
  );
}
