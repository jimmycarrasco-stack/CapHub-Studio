import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Used by CapHub Studio to check that the app and its database are up. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch (err) {
    return Response.json({ ok: false, db: (err as Error).message }, { status: 503 });
  }
}
