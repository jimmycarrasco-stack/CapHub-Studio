import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx, updateLocation } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";

export const PATCH = handle(async (req: Request) => {
  const { location } = await requireCtx("admin");
  const body = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(40).optional(),
      website: z.string().trim().max(200).optional(),
      timezone: z.string().trim().max(60).refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Unknown time zone").optional(),
    }),
  );
  return NextResponse.json(updateLocation(location.id, body));
});
