import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { listOrders, revenueStats } from "@/lib/crm/payments";
import { handle } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json({ orders: listOrders(location.id), revenue: revenueStats(location.id) });
});
