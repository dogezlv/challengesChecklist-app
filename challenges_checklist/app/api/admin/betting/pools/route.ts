import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { createServiceClient } from "@/app/lib/supabase-service";

type OutcomeInput = { week_id: string; week_number: number; outcome_title: string };

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const poolId = typeof body.pool_id === "string" ? body.pool_id : null;
  const seasonId = typeof body.season_id === "string" ? body.season_id : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const winMode =
    body.win_mode === "normales" ? "normales" : "normales_prestigio";
  const durationSeconds = Number(body.duration_seconds) || 600;
  const outcomes = Array.isArray(body.outcomes) ? (body.outcomes as OutcomeInput[]) : [];

  if (!seasonId || !title) {
    return NextResponse.json({ error: "season_id y title requeridos" }, { status: 400 });
  }
  if (durationSeconds < 30 || durationSeconds > 1800) {
    return NextResponse.json({ error: "Duración entre 30 y 1800 segundos" }, { status: 400 });
  }

  const service = createServiceClient();

  if (poolId) {
    const { data: existing } = await service
      .from("betting_pools")
      .select("status")
      .eq("id", poolId)
      .single();
    if (!existing || existing.status !== "draft") {
      return NextResponse.json({ error: "Solo pools en draft son editables" }, { status: 400 });
    }

    await service.from("betting_pool_outcomes").delete().eq("pool_id", poolId);
    await service
      .from("betting_pools")
      .update({
        season_id: seasonId,
        title,
        win_mode: winMode,
        duration_seconds: durationSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", poolId);

    if (outcomes.length > 0) {
      await service.from("betting_pool_outcomes").insert(
        outcomes.map((o) => ({
          pool_id: poolId,
          week_id: o.week_id,
          week_number: o.week_number,
          outcome_title: o.outcome_title.slice(0, 25),
        }))
      );
    }

    const { data: pool } = await service
      .from("betting_pools")
      .select("*, betting_pool_outcomes(*)")
      .eq("id", poolId)
      .single();

    return NextResponse.json({ pool });
  }

  const { data: openPool } = await service
    .from("betting_pools")
    .select("id")
    .eq("season_id", seasonId)
    .in("status", ["open", "locked", "pending_resolve"])
    .maybeSingle();

  if (openPool) {
    return NextResponse.json(
      { error: "Ya hay un pool activo para esta temporada" },
      { status: 400 }
    );
  }

  const { data: weeks } = await service
    .from("challenge_weeks")
    .select("id, week_number")
    .eq("season_id", seasonId)
    .order("week_number");

  const { data: pool, error } = await service
    .from("betting_pools")
    .insert({
      season_id: seasonId,
      title,
      win_mode: winMode,
      duration_seconds: durationSeconds,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !pool) {
    return NextResponse.json({ error: error?.message ?? "Error al crear pool" }, { status: 500 });
  }

  const outcomeRows =
    outcomes.length > 0
      ? outcomes
      : (weeks ?? []).map((w) => ({
          week_id: w.id,
          week_number: w.week_number,
          outcome_title: `Semana ${w.week_number}`,
        }));

  await service.from("betting_pool_outcomes").insert(
    outcomeRows.map((o) => ({
      pool_id: pool.id,
      week_id: o.week_id,
      week_number: o.week_number,
      outcome_title: (o.outcome_title ?? `Semana ${o.week_number}`).slice(0, 25),
    }))
  );

  const { data: full } = await service
    .from("betting_pools")
    .select("*, betting_pool_outcomes(*)")
    .eq("id", pool.id)
    .single();

  return NextResponse.json({ pool: full });
}
