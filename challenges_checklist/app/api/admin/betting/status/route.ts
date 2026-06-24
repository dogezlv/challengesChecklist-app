import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { createServiceClient } from "@/app/lib/supabase-service";
import {
  buildPoolBetSummary,
  getEligibleWeeks,
  type WinMode,
} from "@/app/lib/twitch/betting-weeks";
import {
  getPredictionEventSubStatus,
  getValidTwitchTokens,
  twitchConfigStatus,
  twitchRedirectUri,
} from "@/app/lib/twitch/helix";
import { processPendingResolves } from "@/app/lib/twitch/resolve-pool";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  try {
    await processPendingResolves();
  } catch (e) {
    console.warn("processPendingResolves:", e);
  }

  let tokens = null;
  try {
    tokens = await getValidTwitchTokens();
  } catch (e) {
    console.warn("getValidTwitchTokens:", e);
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("createServiceClient:", e);
    return NextResponse.json(
      {
        error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor",
        twitchConfig: twitchConfigStatus(),
      },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const seasonIdParam = url.searchParams.get("season_id");

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
    .limit(30);

  const activePool =
    pools?.find((p) => ["open", "locked", "pending_resolve"].includes(p.status)) ??
    pools?.find((p) => p.status === "draft") ??
    null;

  const seasonId =
    seasonIdParam ??
    activePool?.season_id ??
    (await service.from("seasons").select("id").eq("is_locked", false).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.id;

  const winMode: WinMode =
    activePool?.win_mode === "normales" ? "normales" : "normales_prestigio";

  let eligibleWeeks: { id: string; week_number: number }[] = [];
  let weekProgress: { week_id: string; week_number: number; pct: number; complete: boolean }[] =
    [];

  if (seasonId) {
    eligibleWeeks = await getEligibleWeeks(service, seasonId, winMode);

    const { data: weeks } = await service
      .from("challenge_weeks")
      .select("id, week_number")
      .eq("season_id", seasonId)
      .order("week_number");

    for (const w of weeks ?? []) {
      const [{ data: pctRow }, { data: done }] = await Promise.all([
        service.rpc("week_completion_pct", { p_week_id: w.id, p_mode: winMode }),
        service.rpc("week_is_complete", { p_week_id: w.id, p_mode: winMode }),
      ]);
      weekProgress.push({
        week_id: w.id,
        week_number: w.week_number,
        pct: Number(pctRow ?? 0),
        complete: !!done,
      });
    }
  }

  const logPoolId = url.searchParams.get("log_pool_id");
  const poolsForLog = (pools ?? []).filter(
    (p) => p.status !== "draft" && p.status !== "cancelled"
  );
  const betSummaries = await Promise.all(
    poolsForLog.slice(0, 12).map((p) =>
      buildPoolBetSummary(service, p.id, {
        title: p.title,
        status: p.status,
        pool_kind: p.pool_kind ?? "week_race",
        opened_at: p.opened_at,
        updated_at: p.updated_at,
      })
    )
  );

  const selectedLog = logPoolId
    ? betSummaries.find((s) => s.pool_id === logPoolId) ?? null
    : betSummaries[0] ?? null;

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
    oauthRedirectUri: twitchRedirectUri(),
    twitchConfig: twitchConfigStatus(),
    broadcaster: tokens
      ? {
          id: tokens.broadcaster_id,
          login: tokens.broadcaster_login,
          name: tokens.broadcaster_name,
        }
      : null,
    eventSub,
    pools: pools ?? [],
    activePool,
    eligibleWeeks,
    weekProgress,
    betSummaries,
    selectedLog,
    canCreateWeekPool: eligibleWeeks.length >= 2,
  });
}
