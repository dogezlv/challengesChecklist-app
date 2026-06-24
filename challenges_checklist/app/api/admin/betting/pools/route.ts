import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { createServiceClient } from "@/app/lib/supabase-service";
import {
  getEligibleWeeks,
  POOL_OUTCOMES_EMBED,
  type WinMode,
} from "@/app/lib/twitch/betting-weeks";

type OutcomeInput = {
  week_id?: string | null;
  week_number?: number | null;
  outcome_title: string;
};

async function loadPoolWithOutcomes(service: ReturnType<typeof createServiceClient>, poolId: string) {
  const { data: pool, error } = await service
    .from("betting_pools")
    .select(`*, ${POOL_OUTCOMES_EMBED}(*)`)
    .eq("id", poolId)
    .single();
  if (error || !pool) {
    throw new Error(error?.message ?? "No se pudo cargar el pool");
  }
  const raw = pool.betting_pool_outcomes;
  pool.betting_pool_outcomes = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return pool;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const poolId = typeof body.pool_id === "string" ? body.pool_id : null;
  const seasonId = typeof body.season_id === "string" ? body.season_id : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const poolKind = body.pool_kind === "custom" ? "custom" : "week_race";
  const winMode: WinMode =
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

  let outcomeRows: {
    week_id: string | null;
    week_number: number | null;
    outcome_title: string;
  }[] = [];

  if (poolKind === "week_race") {
    const eligible = await getEligibleWeeks(service, seasonId, winMode);
    if (eligible.length < 2) {
      return NextResponse.json(
        {
          error: `Solo quedan ${eligible.length} semana(s) sin completar. Se necesitan al menos 2 para abrir una apuesta.`,
        },
        { status: 400 }
      );
    }

    const eligibleIds = new Set(eligible.map((w) => w.id));
    if (outcomes.length > 0) {
      outcomeRows = outcomes
        .filter((o) => o.week_id && eligibleIds.has(o.week_id))
        .map((o) => ({
          week_id: o.week_id!,
          week_number: o.week_number ?? null,
          outcome_title: o.outcome_title.slice(0, 25),
        }));
    } else {
      outcomeRows = eligible.map((w) => ({
        week_id: w.id,
        week_number: w.week_number,
        outcome_title: `Semana ${w.week_number}`,
      }));
    }

    if (outcomeRows.length < 2) {
      return NextResponse.json(
        { error: "Selecciona al menos 2 semanas sin completar." },
        { status: 400 }
      );
    }
  } else {
    outcomeRows = outcomes
      .map((o, i) => ({
        week_id: null,
        week_number: i + 1,
        outcome_title: (o.outcome_title ?? `Opción ${i + 1}`).slice(0, 25),
      }))
      .filter((o) => o.outcome_title.trim());

    if (outcomeRows.length < 2) {
      return NextResponse.json(
        { error: "Añade al menos 2 opciones para la apuesta libre." },
        { status: 400 }
      );
    }
    if (outcomeRows.length > 10) {
      return NextResponse.json({ error: "Máximo 10 opciones." }, { status: 400 });
    }
  }

  const upsertOutcomes = async (targetPoolId: string) => {
    const { error: delErr } = await service
      .from("betting_pool_outcomes")
      .delete()
      .eq("pool_id", targetPoolId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await service.from("betting_pool_outcomes").insert(
      outcomeRows.map((o) => ({
        pool_id: targetPoolId,
        week_id: o.week_id,
        week_number: o.week_number,
        outcome_title: o.outcome_title,
      }))
    );
    if (insErr) throw new Error(insErr.message);
  };

  try {
  if (poolId) {
    const { data: existing } = await service
      .from("betting_pools")
      .select("status")
      .eq("id", poolId)
      .single();
    if (!existing || existing.status !== "draft") {
      return NextResponse.json({ error: "Solo pools en draft son editables" }, { status: 400 });
    }

    const { error: updErr } = await service
      .from("betting_pools")
      .update({
        season_id: seasonId,
        title,
        pool_kind: poolKind,
        win_mode: winMode,
        duration_seconds: durationSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", poolId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await upsertOutcomes(poolId);

    const pool = await loadPoolWithOutcomes(service, poolId);
    return NextResponse.json({ pool });
  }

  const { data: openPool } = await service
    .from("betting_pools")
    .select("id, title")
    .eq("season_id", seasonId)
    .in("status", ["open", "locked", "pending_resolve"])
    .maybeSingle();

  if (openPool) {
    return NextResponse.json(
      {
        error: `Ya hay una apuesta activa («${openPool.title}»). Cancélala o espera a que se resuelva antes de crear otra.`,
      },
      { status: 400 }
    );
  }

  const { data: pool, error } = await service
    .from("betting_pools")
    .insert({
      season_id: seasonId,
      title,
      pool_kind: poolKind,
      win_mode: winMode,
      duration_seconds: durationSeconds,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !pool) {
    return NextResponse.json({ error: error?.message ?? "Error al crear pool" }, { status: 500 });
  }

  await upsertOutcomes(pool.id);

  const full = await loadPoolWithOutcomes(service, pool.id);
  return NextResponse.json({ pool: full });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
