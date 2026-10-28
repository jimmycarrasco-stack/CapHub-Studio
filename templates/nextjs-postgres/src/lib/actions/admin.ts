"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";

const schema = z.object({ userId: z.string().uuid(), role: z.enum(["user", "admin"]) });

export async function setUserRole(formData: FormData) {
  const admin = await requireAdmin();
  const { userId, role } = schema.parse(Object.fromEntries(formData));
  if (userId === admin.id) return; // admins can't demote themselves (avoids locking everyone out)
  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath("/admin");
}
