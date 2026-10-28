import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentContext, getSessionUser, roleIn, type Ctx, type LocationRole } from "./auth";

/** For server pages: the signed-in user's current sub-account, or a redirect. */
export async function pageCtx(minRole: LocationRole = "user"): Promise<Ctx> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getCurrentContext();
  if (!ctx) redirect(user.agency_role ? "/agency" : "/no-access");
  if (minRole === "admin" && ctx.role !== "admin") redirect("/");
  return ctx;
}

/** For record pages (e.g. /contacts/[id]): 404 unless the user can access the record's sub-account. */
export async function pageAccess(locationId: string | null | undefined) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!locationId || !roleIn(user, locationId)) notFound();
}

export async function agencyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.agency_role) redirect("/");
  return user;
}
