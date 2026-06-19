import { NextResponse } from "next/server";
import { createServiceClient } from "@/app/lib/supabase-service";
import { verifyEventSubSignature } from "@/app/lib/twitch/helix";
import { processPendingResolves } from "@/app/lib/twitch/resolve-pool";

type ProgressEvent = {
  subscription: { type: string };
  event: {
    id: string;
    outcomes: {
      id: string;
      top_predictors: {
        user_id: string;
        user_login: string;
        user_name: string;
        channel_points_used: number;
      }[] | null;
    }[];
  };
};

export async function POST(req: Request) {
  const bodyText = await req.text();
  const messageType = req.headers.get("twitch-eventsub-message-type");

  if (messageType === "webhook_callback_verification") {
    const payload = JSON.parse(bodyText) as { challenge: string };
    return new NextResponse(payload.challenge, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  const msgId = req.headers.get("twitch-eventsub-message-id") ?? "";
  const timestamp = req.headers.get("twitch-eventsub-message-timestamp") ?? "";
  const signature = req.headers.get("twitch-eventsub-message-signature") ?? "";

  if (
    process.env.TWITCH_EVENTSUB_SECRET &&
    !verifyEventSubSignature(msgId, timestamp, bodyText, signature)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  if (messageType !== "notification") {
    return NextResponse.json({ ok: true });
  }

  const payload = JSON.parse(bodyText) as ProgressEvent;
  const subType = payload.subscription?.type;

  if (subType === "channel.prediction.progress") {
    const service = createServiceClient();
    const predictionId = payload.event.id;

    const { data: pool } = await service
      .from("betting_pools")
      .select("id")
      .eq("twitch_prediction_id", predictionId)
      .in("status", ["open", "locked"])
      .maybeSingle();

    if (pool) {
      for (const outcome of payload.event.outcomes) {
        for (const p of outcome.top_predictors ?? []) {
          await service.from("betting_prediction_bets").upsert(
            {
              pool_id: pool.id,
              twitch_user_id: p.user_id,
              twitch_login: p.user_login,
              twitch_display_name: p.user_name,
              twitch_outcome_id: outcome.id,
              points_wagered: p.channel_points_used,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "pool_id,twitch_user_id,twitch_outcome_id" }
          );
        }
      }

      await service
        .from("betting_pools")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", pool.id)
        .eq("status", "open");
    }
  }

  if (subType === "channel.prediction.lock") {
    const service = createServiceClient();
    await service
      .from("betting_pools")
      .update({ status: "locked", updated_at: new Date().toISOString() })
      .eq("twitch_prediction_id", payload.event.id)
      .eq("status", "open");
  }

  await processPendingResolves();

  return NextResponse.json({ ok: true });
}
