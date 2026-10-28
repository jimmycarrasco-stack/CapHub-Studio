import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, getUserByEmail, listLocationTeam, requireCtx, setMembership } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx("admin");
  return NextResponse.json(listLocationTeam(location.id));
});

/**
 * Adds someone to this sub-account. Existing users (by email) just get access; new users are
 * created with the password the admin sets, which they can share with them.
 */
export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx("admin");
  const b = await parseBody(
    req,
    z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      name: z.string().trim().max(100).optional(),
      password: z.string().min(10, "Passwords need at least 10 characters").max(200).optional(),
      role: z.enum(["admin", "user"]),
    }),
  );
  let user = getUserByEmail(b.email);
  if (!user) {
    if (!b.password) throw new HttpError(400, "New users need a starting password (10+ characters)");
    user = await createUser({ email: b.email, name: b.name || b.email.split("@")[0], password: b.password });
  }
  setMembership(user.id, location.id, b.role);
  return NextResponse.json(listLocationTeam(location.id), { status: 201 });
});
