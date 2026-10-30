import "server-only";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { HttpError } from "./errors";
import { hashPassword } from "./passwords";
import { LOCATION_COOKIE, SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Users, the agency, sub-accounts (locations) and access control.
 *
 *  - Agency owner/admins (users.agency_role) can see and manage every sub-account and agency settings.
 *  - Everyone else has memberships: role "admin" (can change the sub-account's settings and team)
 *    or "user" (works with contacts, pipelines, etc.).
 */

export type AgencyRole = "owner" | "admin";
export type LocationRole = "admin" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  agency_role: AgencyRole | null;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  timezone: string;
  email: string;
  phone: string;
  website: string;
  /** "suspended" blocks sign-in for its users (agency admins still have access). */
  status: "active" | "suspended";
  source_order_id: string | null;
  billing_location_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

export interface Ctx {
  user: User;
  location: Location;
  /** Effective role in this sub-account (agency admins count as admin). */
  role: LocationRole;
  isAgencyAdmin: boolean;
}

const USER_COLS = "id, email, name, agency_role, created_at";

export function userCount() {
  return (db().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function getUserById(id: string): User | null {
  return (db().prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as User | undefined) ?? null;
}

export function getUserWithHashByEmail(email: string) {
  return (db().prepare(`SELECT ${USER_COLS}, password_hash FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined) ?? null;
}

export async function createUser(input: { email: string; name: string; password: string; agencyRole?: AgencyRole | null }) {
  const id = nanoid(12);
  try {
    db()
      .prepare("INSERT INTO users (id, email, name, password_hash, agency_role) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.email.trim().toLowerCase(), input.name.trim(), await hashPassword(input.password), input.agencyRole ?? null);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new HttpError(409, "A user with that email already exists");
    throw err;
  }
  return getUserById(id)!;
}

export async function setUserPassword(userId: string, password: string) {
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password), userId);
}

export function getUserByEmail(email: string): User | null {
  return (db().prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as User | undefined) ?? null;
}

export function updateUser(id: string, patch: { name?: string; agencyRole?: AgencyRole | null }) {
  if (patch.name !== undefined) db().prepare("UPDATE users SET name = ? WHERE id = ?").run(patch.name.trim(), id);
  if (patch.agencyRole !== undefined) db().prepare("UPDATE users SET agency_role = ? WHERE id = ?").run(patch.agencyRole, id);
  return getUserById(id);
}

export function deleteUser(id: string) {
  db().prepare("DELETE FROM users WHERE id = ?").run(id);
}

/** Agency users with the sub-accounts each belongs to. */
export function listUsersWithMemberships() {
  const users = listAgencyUsers();
  const rows = db().prepare("SELECT m.user_id, m.location_id, m.role, l.name FROM memberships m JOIN locations l ON l.id = m.location_id").all() as {
    user_id: string;
    location_id: string;
    role: LocationRole;
    name: string;
  }[];
  return users.map((u) => ({ ...u, locations: rows.filter((r) => r.user_id === u.id).map((r) => ({ id: r.location_id, name: r.name, role: r.role })) }));
}

export function listAgencyUsers() {
  return db().prepare(`SELECT ${USER_COLS} FROM users ORDER BY created_at`).all() as User[];
}

// ───────── locations ─────────

export function getLocation(id: string): Location | null {
  return (db().prepare("SELECT * FROM locations WHERE id = ?").get(id) as Location | undefined) ?? null;
}

export function listAllLocations(): Location[] {
  return db().prepare("SELECT * FROM locations ORDER BY name COLLATE NOCASE").all() as Location[];
}

export function createLocation(input: { name: string; timezone?: string; email?: string; phone?: string; website?: string }) {
  const id = nanoid(10);
  db()
    .prepare("INSERT INTO locations (id, name, timezone, email, phone, website) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.name.trim(), input.timezone || "America/Winnipeg", input.email ?? "", input.phone ?? "", input.website ?? "");
  return getLocation(id)!;
}

export function updateLocation(id: string, patch: Partial<Pick<Location, "name" | "timezone" | "email" | "phone" | "website">>) {
  const cols = (["name", "timezone", "email", "phone", "website"] as const).filter((c) => patch[c] !== undefined);
  if (cols.length) db().prepare(`UPDATE locations SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...cols.map((c) => patch[c]), id);
  return getLocation(id);
}

export function setLocationStatus(id: string, status: "active" | "suspended") {
  db().prepare("UPDATE locations SET status = ? WHERE id = ?").run(status, id);
}

export function deleteLocation(id: string) {
  db().prepare("DELETE FROM locations WHERE id = ?").run(id);
}

/** Sub-accounts a user can open. Agency admins see all. */
export function listUserLocations(user: User): (Location & { role: LocationRole })[] {
  if (user.agency_role) return listAllLocations().map((l) => ({ ...l, role: "admin" as const }));
  return db()
    .prepare(
      "SELECT l.*, m.role FROM memberships m JOIN locations l ON l.id = m.location_id WHERE m.user_id = ? AND l.status = 'active' ORDER BY l.name COLLATE NOCASE",
    )
    .all(user.id) as (Location & { role: LocationRole })[];
}

export function roleIn(user: User, locationId: string): LocationRole | null {
  if (user.agency_role) return getLocation(locationId) ? "admin" : null;
  const r = db()
    .prepare("SELECT m.role FROM memberships m JOIN locations l ON l.id = m.location_id WHERE m.user_id = ? AND m.location_id = ? AND l.status = 'active'")
    .get(user.id, locationId) as { role: LocationRole } | undefined;
  return r?.role ?? null;
}

export function setMembership(userId: string, locationId: string, role: LocationRole) {
  db()
    .prepare("INSERT INTO memberships (user_id, location_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, location_id) DO UPDATE SET role = excluded.role")
    .run(userId, locationId, role);
}

export function removeMembership(userId: string, locationId: string) {
  db().prepare("DELETE FROM memberships WHERE user_id = ? AND location_id = ?").run(userId, locationId);
}

export function listLocationTeam(locationId: string) {
  return db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.agency_role, u.created_at, m.role FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.location_id = ? ORDER BY u.name COLLATE NOCASE`,
    )
    .all(locationId) as (User & { role: LocationRole })[];
}

// ───────── request context ─────────

/** The signed-in user for this request, or null. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const id = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.APP_SECRET);
  return id ? getUserById(id) : null;
});

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Not signed in");
  return user;
}

export async function requireAgencyAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.agency_role) throw new HttpError(403, "Only agency admins can do this");
  return user;
}

/** The sub-account the user is working in (cookie), falling back to their first one. */
export const getCurrentContext = cache(async (): Promise<Ctx | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const preferred = (await cookies()).get(LOCATION_COOKIE)?.value;
  const locations = listUserLocations(user);
  const loc = locations.find((l) => l.id === preferred) ?? locations[0];
  if (!loc) return null;
  const { role, ...location } = loc;
  return { user, location, role, isAgencyAdmin: !!user.agency_role };
});

/** For list/create endpoints: the current sub-account. */
export async function requireCtx(minRole: LocationRole = "user"): Promise<Ctx> {
  await requireUser();
  const ctx = await getCurrentContext();
  if (!ctx) throw new HttpError(403, "You don't have access to any sub-account yet. Ask your agency admin to add you.");
  if (minRole === "admin" && ctx.role !== "admin") throw new HttpError(403, "Only sub-account admins can do this");
  return ctx;
}

/** For endpoints on a specific record: checks the user can access the record's sub-account. */
export async function requireAccess(locationId: string | null | undefined, minRole: LocationRole = "user"): Promise<Ctx> {
  const user = await requireUser();
  const role = locationId ? roleIn(user, locationId) : null;
  // Not found and not allowed look the same, so record IDs can't be probed.
  if (!role) throw new HttpError(404, "Not found");
  if (minRole === "admin" && role !== "admin") throw new HttpError(403, "Only sub-account admins can do this");
  return { user, location: getLocation(locationId!)!, role, isAgencyAdmin: !!user.agency_role };
}
