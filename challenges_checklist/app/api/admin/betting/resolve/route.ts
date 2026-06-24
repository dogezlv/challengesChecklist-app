import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { resolveBettingPool } from "@/app/lib/twitch/resolve-pool";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const poolId = typeof body.pool_id === "string" ? body.pool_id : null;
  const winningOutcomeId =
    typeof body.winning_outcome_id === "string" ? body.winning_outcome_id : undefined;

  if (!poolId) {
    return NextResponse.json({ error: "pool_id requerido" }, { status: 400 });
  }

  try {
    const result = await resolveBettingPool(poolId, winningOutcomeId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
