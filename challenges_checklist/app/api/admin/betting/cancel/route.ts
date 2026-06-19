import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { createServiceClient } from "@/app/lib/supabase-service";
import { cancelPrediction, getValidTwitchTokens } from "@/app/lib/twitch/helix";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const poolId = typeof body.pool_id === "string" ? body.pool_id : null;
  if (!poolId) {
    return NextResponse.json({ error: "pool_id requerido" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: pool } = await service
    .from("betting_pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return NextResponse.json({ error: "Pool no encontrado" }, { status: 404 });
  }

  if (pool.twitch_prediction_id && pool.status === "open") {
    const tokens = await getValidTwitchTokens();
    if (tokens) {
      try {
        await cancelPrediction(tokens, pool.twitch_prediction_id);
      } catch {
        /* prediction may already be locked/resolved */
      }
    }
  }

  await service
    .from("betting_pools")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", poolId);

  return NextResponse.json({ success: true });
}
