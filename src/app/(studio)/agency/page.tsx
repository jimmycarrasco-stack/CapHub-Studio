import { listAllLocations, listUsersWithMemberships } from "@/lib/auth";
import { db } from "@/lib/db";
import { agencyPage } from "@/lib/page-ctx";
import { Agency } from "./agency";

export const metadata = { title: "Agency" };

export default async function AgencyPage() {
  const me = await agencyPage();
  const counts = db()
    .prepare(
      `SELECT l.id, (SELECT COUNT(*) FROM contacts c WHERE c.location_id = l.id) AS contacts,
              (SELECT COUNT(*) FROM memberships m WHERE m.location_id = l.id) AS members
       FROM locations l`,
    )
    .all() as { id: string; contacts: number; members: number }[];
  const locations = listAllLocations().map((l) => ({ ...l, ...(counts.find((c) => c.id === l.id) ?? { contacts: 0, members: 0 }) }));
  return <Agency me={{ id: me.id, role: me.agency_role! }} initialLocations={locations} initialUsers={listUsersWithMemberships()} />;
}
