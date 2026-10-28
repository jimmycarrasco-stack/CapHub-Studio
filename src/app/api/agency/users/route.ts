import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, listUsersWithMemberships, requireAgencyAdmin } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";

export const GET = handle(async () => {
  await requireAgencyAdmin();
  return NextResponse.json(listUsersWithMemberships());
});

/** Creates an agency admin (sees every sub-account). Sub-account users are added from that sub-account's settings. */
export const POST = handle(async (req: Request) => {
  await requireAgencyAdmin();
  const b = await parseBody(
    req,
    z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      name: z.string().trim().min(1).max(100),
      password: z.string().min(10, "Passwords need at least 10 characters").max(200),
    }),
  );
  await createUser({ ...b, agencyRole: "admin" });
  return NextResponse.json(listUsersWithMemberships(), { status: 201 });
});
