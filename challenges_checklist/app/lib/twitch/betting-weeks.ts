import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST embed hint (db/43 añadió winning_outcome_id → ambigüedad sin esto). */
export const POOL_OUTCOMES_EMBED = "betting_pool_outcomes!betting_pool_outcomes_pool_id_fkey";

export type WinMode = "normales" | "normales_prestigio";

export type WeekRow = { id: string; week_number: number };

/** Semanas de la temporada que aún no cumplen win_mode (elegibles para apuesta). */
export async function getEligibleWeeks(
  service: SupabaseClient,
  seasonId: string,
  winMode: WinMode
): Promise<WeekRow[]> {
  const { data: weeks } = await service
    .from("challenge_weeks")
    .select("id, week_number")
    .eq("season_id", seasonId)
    .order("week_number");

  const eligible: WeekRow[] = [];
  for (const w of weeks ?? []) {
    const { data: done } = await service.rpc("week_is_complete", {
      p_week_id: w.id,
      p_mode: winMode,
    });
    if (!done) eligible.push(w);
  }
  return eligible;
}

export type BetLogEntry = {
  twitch_user_id: string;
  twitch_login: string | null;
  twitch_display_name: string | null;
  twitch_outcome_id: string;
  outcome_title: string | null;
  points_wagered: number;
};

export type PoolBetSummary = {
  pool_id: string;
  title: string;
  status: string;
  pool_kind: string;
  opened_at: string | null;
  resolved_at: string | null;
  total_bettors: number;
  total_points: number;
  top_bettors: {
    twitch_user_id: string;
    twitch_login: string | null;
    twitch_display_name: string | null;
    total_points: number;
    bets_count: number;
  }[];
  bets: BetLogEntry[];
};

export async function buildPoolBetSummary(
  service: SupabaseClient,
  poolId: string,
  poolMeta: {
    title: string;
    status: string;
    pool_kind: string;
    opened_at: string | null;
    updated_at: string;
  }
): Promise<PoolBetSummary> {
  const [{ data: bets }, { data: outcomes }] = await Promise.all([
    service
      .from("betting_prediction_bets")
      .select(
        "twitch_user_id, twitch_login, twitch_display_name, twitch_outcome_id, points_wagered"
      )
      .eq("pool_id", poolId)
      .order("points_wagered", { ascending: false }),
    service
      .from("betting_pool_outcomes")
      .select("twitch_outcome_id, outcome_title")
      .eq("pool_id", poolId),
  ]);

  const titleByOutcome = new Map(
    (outcomes ?? []).map((o) => [o.twitch_outcome_id, o.outcome_title as string])
  );

  const byUser = new Map<
    string,
    {
      twitch_user_id: string;
      twitch_login: string | null;
      twitch_display_name: string | null;
      total_points: number;
      bets_count: number;
    }
  >();

  let totalPoints = 0;
  const log: BetLogEntry[] = [];
  for (const b of bets ?? []) {
    totalPoints += b.points_wagered ?? 0;
    log.push({
      twitch_user_id: b.twitch_user_id,
      twitch_login: b.twitch_login,
      twitch_display_name: b.twitch_display_name,
      twitch_outcome_id: b.twitch_outcome_id,
      outcome_title: titleByOutcome.get(b.twitch_outcome_id) ?? null,
      points_wagered: b.points_wagered,
    });
    const cur = byUser.get(b.twitch_user_id);
    if (!cur) {
      byUser.set(b.twitch_user_id, {
        twitch_user_id: b.twitch_user_id,
        twitch_login: b.twitch_login,
        twitch_display_name: b.twitch_display_name,
        total_points: b.points_wagered,
        bets_count: 1,
      });
    } else {
      cur.total_points += b.points_wagered;
      cur.bets_count += 1;
    }
  }

  const topBettors = [...byUser.values()]
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 15);

  return {
    pool_id: poolId,
    title: poolMeta.title,
    status: poolMeta.status,
    pool_kind: poolMeta.pool_kind,
    opened_at: poolMeta.opened_at,
    resolved_at: poolMeta.status === "resolved" ? poolMeta.updated_at : null,
    total_bettors: byUser.size,
    total_points: totalPoints,
    top_bettors: topBettors,
    bets: log,
  };
}
