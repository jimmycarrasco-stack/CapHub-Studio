import { NextResponse } from "next/server";
import { appFor } from "@/lib/guards";
import { handle, HttpError } from "@/lib/http";
import { isRunning } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";
import { restoreAppSnapshot } from "@/lib/apps/service";

/** Restores the project files to this version (saved as a new version, so it can be undone). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string; snapshotId: string }> }) => {
  const { id, snapshotId } = await ctx.params;
  const { app } = await appFor(id);
  if (isRunning(app.id)) throw new HttpError(409, "Stop the AI before restoring a version");
  const sid = Number(snapshotId);
  if (!Number.isInteger(sid)) throw new HttpError(400, "Invalid version");
  return NextResponse.json({ snapshotId: await restoreAppSnapshot(app.id, sid) });
});
