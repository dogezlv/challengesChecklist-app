import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { createServiceClient } from "@/app/lib/supabase-service";
import { createPrediction, ensurePredictionEventSub, getValidTwitchTokens } from "@/app/lib/twitch/helix";

type PoolOutcome = {
  id: string;
  week_number: number | null;
  outcome_title: string;
};

function normalizeOutcomes(raw: unknown): PoolOutcome[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .filter((o): o is PoolOutcome => !!o && typeof o === "object" && typeof (o as PoolOutcome).id === "string")
    .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0));
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const poolId = typeof body.pool_id === "string" ? body.pool_id : null;
  if (!poolId) {
    return NextResponse.json({ error: "pool_id requerido" }, { status: 400 });
  }

  const tokens = await getValidTwitchTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Conecta Twitch primero" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: pool } = await service
    .from("betting_pools")
    .select("*, betting_pool_outcomes(*)")
    .eq("id", poolId)
    .single();

  if (!pool || pool.status !== "draft") {
    return NextResponse.json({ error: "Pool debe estar en draft" }, { status: 400 });
  }

  const outcomes = normalizeOutcomes(pool.betting_pool_outcomes);

  if (outcomes.length < 2) {
    return NextResponse.json(
      { error: "Se necesitan al menos 2 opciones. Guarda el borrador de nuevo." },
      { status: 400 }
    );
  }

  try {
    const eventsub = await ensurePredictionEventSub(tokens.broadcaster_id);
    if (eventsub.missingSecret) {
      return NextResponse.json(
        { error: "Falta TWITCH_EVENTSUB_SECRET en el servidor" },
        { status: 500 }
      );
    }

    const prediction = await createPrediction(
      tokens,
      pool.title,
      outcomes.map((o) => ({ title: o.outcome_title })),
      pool.duration_seconds
    );

    const helixOutcomes = prediction.outcomes ?? [];
    for (let i = 0; i < outcomes.length; i++) {
      const row = outcomes[i];
      const helixOutcome = helixOutcomes[i];
      if (!row?.id || !helixOutcome?.id) continue;
      await service
        .from("betting_pool_outcomes")
        .update({ twitch_outcome_id: helixOutcome.id })
        .eq("id", row.id);
    }

    await service
      .from("betting_pools")
      .update({
        status: "open",
        twitch_prediction_id: prediction.id,
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", poolId);

    return NextResponse.json({
      success: true,
      prediction_id: prediction.id,
      status: prediction.status,
      eventsub,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
