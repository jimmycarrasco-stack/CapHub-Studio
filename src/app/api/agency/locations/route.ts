import { NextResponse } from "next/server";
import { createLocation, listAllLocations, requireAgencyAdmin } from "@/lib/auth";
import { createPipeline } from "@/lib/crm/pipelines";
import { locationSchema } from "@/lib/crm/schemas";
import { handle, parseBody } from "@/lib/http";


export const GET = handle(async () => {
  await requireAgencyAdmin();
  return NextResponse.json(listAllLocations());
});

/** New sub-account, with a starter sales pipeline. */
export const POST = handle(async (req: Request) => {
  await requireAgencyAdmin();
  const loc = createLocation(await parseBody(req, locationSchema));
  createPipeline(loc.id, "Sales pipeline");
  return NextResponse.json(loc, { status: 201 });
});
