"use server";

import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { users } from "../db/schema";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "../session";

export type FormState = { error?: string } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

async function startSession(userId: string, role: "user" | "admin") {
  (await cookies()).set(SESSION_COOKIE, await signSession({ userId, role }), sessionCookieOptions);
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { error: "An account with that email already exists" };

  // The first account becomes the admin.
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  const role = userCount === 0 ? "admin" : "user";

  const [user] = await db
    .insert(users)
    .values({ name, email, role, passwordHash: await bcrypt.hash(password, 10) })
    .returning({ id: users.id, role: users.role });
  await startSession(user.id, user.role);
  redirect("/dashboard");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "Incorrect email or password" };
  }
  await startSession(user.id, user.role);
  redirect("/dashboard");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
