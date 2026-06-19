import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import {
  ensurePredictionEventSub,
  getPredictionEventSubStatus,
  getValidTwitchTokens,
} from "@/app/lib/twitch/helix";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tokens = await getValidTwitchTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Conecta Twitch primero" }, { status: 400 });
  }

  try {
    const status = await getPredictionEventSubStatus(tokens.broadcaster_id);
    return NextResponse.json(status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tokens = await getValidTwitchTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Conecta Twitch primero" }, { status: 400 });
  }

  try {
    const result = await ensurePredictionEventSub(tokens.broadcaster_id);
    if (result.missingSecret) {
      return NextResponse.json(
        { error: "Falta TWITCH_EVENTSUB_SECRET en el servidor" },
        { status: 500 }
      );
    }
    const status = await getPredictionEventSubStatus(tokens.broadcaster_id);
    return NextResponse.json({ ...result, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
