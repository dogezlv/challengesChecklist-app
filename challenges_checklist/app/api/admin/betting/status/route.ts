import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { createServiceClient } from "@/app/lib/supabase-service";
import { getPredictionEventSubStatus, getValidTwitchTokens } from "@/app/lib/twitch/helix";
import { processPendingResolves } from "@/app/lib/twitch/resolve-pool";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  await processPendingResolves();

  const service = createServiceClient();
  const tokens = await getValidTwitchTokens();

  const { data: pools } = await service
    .from("betting_pools")
    .select(
      `
      *,
      betting_pool_outcomes (
        id, week_id, week_number, outcome_title, twitch_outcome_id
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const activePool = pools?.find((p) =>
    ["draft", "open", "locked", "pending_resolve", "resolved"].includes(p.status)
  );

  let weekProgress: { week_id: string; week_number: number; pct: number }[] = [];
  if (activePool) {
    const { data: weeks } = await service
      .from("challenge_weeks")
      .select("id, week_number")
      .eq("season_id", activePool.season_id)
      .order("week_number");

    for (const w of weeks ?? []) {
      const { data: pctRow } = await service.rpc("week_completion_pct", {
        p_week_id: w.id,
        p_mode: activePool.win_mode,
      });
      weekProgress.push({
        week_id: w.id,
        week_number: w.week_number,
        pct: Number(pctRow ?? 0),
      });
    }
  }

  let eventSub: Awaited<ReturnType<typeof getPredictionEventSubStatus>> | null = null;
  if (tokens) {
    try {
      eventSub = await getPredictionEventSubStatus(tokens.broadcaster_id);
    } catch {
      eventSub = null;
    }
  }

  return NextResponse.json({
    twitchConnected: !!tokens,
    broadcaster: tokens
      ? {
          id: tokens.broadcaster_id,
          login: tokens.broadcaster_login,
          name: tokens.broadcaster_name,
        }
      : null,
    eventSub,
    pools: pools ?? [],
    activePool: activePool ?? null,
    weekProgress,
  });
}
