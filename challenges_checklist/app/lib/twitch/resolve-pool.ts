import { createServiceClient } from "@/app/lib/supabase-service";
import {
  getPrediction,
  getValidTwitchTokens,
  resolvePrediction,
  type HelixPredictor,
} from "@/app/lib/twitch/helix";
import { newRaffleSeed, weightedPick, type RaffleEntry } from "@/app/lib/twitch/raffle";

export type ResolveResult = {
  poolId: string;
  winningWeekId: string;
  raffleWinner: {
    twitch_user_id: string;
    login: string | null;
    display_name: string | null;
    points: number;
  } | null;
  entrantsCount: number;
  alreadyResolved?: boolean;
};

type PoolRow = {
  id: string;
  status: string;
  twitch_prediction_id: string | null;
  winning_week_id: string | null;
  win_mode: string;
  raffle_seed: string | null;
  raffle_winner_twitch_user_id: string | null;
};

type OutcomeRow = {
  id: string;
  week_id: string;
  twitch_outcome_id: string | null;
};

function mergePredictors(
  acc: Map<string, RaffleEntry>,
  predictors: HelixPredictor[] | null | undefined
) {
  for (const p of predictors ?? []) {
    const existing = acc.get(p.user_id);
    const pts = p.channel_points_used ?? 0;
    if (!existing || pts > existing.points) {
      acc.set(p.user_id, {
        userId: p.user_id,
        login: p.user_login,
        displayName: p.user_name,
        points: pts,
      });
    }
  }
}

export async function resolveBettingPool(poolId: string): Promise<ResolveResult> {
  const service = createServiceClient();

  const { data: pool, error: poolErr } = await service
    .from("betting_pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (poolErr || !pool) throw new Error("Pool no encontrado");
  const p = pool as PoolRow;

  if (p.status === "resolved" && p.raffle_winner_twitch_user_id) {
    return {
      poolId,
      winningWeekId: p.winning_week_id!,
      raffleWinner: {
        twitch_user_id: p.raffle_winner_twitch_user_id,
        login: (pool as { raffle_winner_login?: string }).raffle_winner_login ?? null,
        display_name: (pool as { raffle_winner_display_name?: string }).raffle_winner_display_name ?? null,
        points: 0,
      },
      entrantsCount: 0,
      alreadyResolved: true,
    };
  }

  if (!p.winning_week_id) throw new Error("Semana ganadora aún no definida");
  if (!p.twitch_prediction_id) throw new Error("Prediction de Twitch no vinculada");

  const { data: outcomes } = await service
    .from("betting_pool_outcomes")
    .select("*")
    .eq("pool_id", poolId);

  const winningOutcome = (outcomes as OutcomeRow[] | null)?.find(
    (o) => o.week_id === p.winning_week_id
  );
  if (!winningOutcome?.twitch_outcome_id) {
    throw new Error("Outcome de Twitch no encontrado para la semana ganadora");
  }

  const tokens = await getValidTwitchTokens();
  if (!tokens) throw new Error("Twitch no conectado");

  try {
    await resolvePrediction(tokens, p.twitch_prediction_id, winningOutcome.twitch_outcome_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await service
      .from("betting_pools")
      .update({ resolve_error: msg, updated_at: new Date().toISOString() })
      .eq("id", poolId);
    throw e;
  }

  const prediction = await getPrediction(tokens, p.twitch_prediction_id);
  const winningHelix = prediction?.outcomes.find((o) => o.id === winningOutcome.twitch_outcome_id);

  const { data: storedBets } = await service
    .from("betting_prediction_bets")
    .select("*")
    .eq("pool_id", poolId)
    .eq("twitch_outcome_id", winningOutcome.twitch_outcome_id);

  const acc = new Map<string, RaffleEntry>();
  for (const b of storedBets ?? []) {
    acc.set(b.twitch_user_id, {
      userId: b.twitch_user_id,
      login: b.twitch_login,
      displayName: b.twitch_display_name,
      points: b.points_wagered,
    });
  }
  mergePredictors(acc, winningHelix?.top_predictors);

  const entries = [...acc.values()].filter((e) => e.points > 0);
  const seed = p.raffle_seed ?? newRaffleSeed();
  const winner = weightedPick(entries, seed);

  await service.from("betting_raffle_entries").delete().eq("pool_id", poolId);
  if (entries.length > 0) {
    await service.from("betting_raffle_entries").insert(
      entries.map((e) => ({
        pool_id: poolId,
        twitch_user_id: e.userId,
        twitch_login: e.login,
        twitch_display_name: e.displayName,
        points_wagered: e.points,
      }))
    );
  }

  await service
    .from("betting_pools")
    .update({
      status: "resolved",
      raffle_seed: seed,
      raffle_winner_twitch_user_id: winner?.userId ?? null,
      raffle_winner_login: winner?.login ?? null,
      raffle_winner_display_name: winner?.displayName ?? null,
      resolve_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poolId);

  return {
    poolId,
    winningWeekId: p.winning_week_id,
    raffleWinner: winner
      ? {
          twitch_user_id: winner.userId,
          login: winner.login ?? null,
          display_name: winner.displayName ?? null,
          points: winner.points,
        }
      : null,
    entrantsCount: entries.length,
  };
}

export async function processPendingResolves(): Promise<ResolveResult[]> {
  const service = createServiceClient();
  const { data: pending } = await service
    .from("betting_pools")
    .select("id")
    .eq("status", "pending_resolve");

  const results: ResolveResult[] = [];
  for (const row of pending ?? []) {
    try {
      results.push(await resolveBettingPool(row.id));
    } catch (e) {
      console.error("Auto-resolve failed for pool", row.id, e);
    }
  }
  return results;
}
