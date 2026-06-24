import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/app/lib/supabase-service";
import {
  ensurePredictionEventSub,
  twitchClientId,
  twitchClientSecret,
  twitchRedirectUri,
} from "@/app/lib/twitch/helix";

function bettingRedirect(req: Request, params: Record<string, string>) {
  const dest = new URL("/admin/betting", req.url);
  for (const [key, value] of Object.entries(params)) {
    dest.searchParams.set(key, value);
  }
  return NextResponse.redirect(dest);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const params: Record<string, string> = { error };
    if (error === "redirect_mismatch") {
      params.expected_uri = twitchRedirectUri();
    }
    return bettingRedirect(req, params);
  }

  try {
  const cookieStore = await cookies();
  const savedState = cookieStore.get("twitch_oauth_state")?.value;
  cookieStore.delete("twitch_oauth_state");

  if (!code || !state || state !== savedState) {
    return bettingRedirect(req, { error: "oauth_state" });
  }

  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: twitchClientId(),
      client_secret: twitchClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: twitchRedirectUri(),
    }),
  });

  if (!tokenRes.ok) {
    return bettingRedirect(req, { error: "token_exchange" });
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string[];
  };

  const userRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Client-Id": twitchClientId(),
    },
  });
  if (!userRes.ok) {
    return bettingRedirect(req, { error: "user_fetch" });
  }

  const userData = (await userRes.json()) as {
    data: { id: string; login: string; display_name: string }[];
  };
  const user = userData.data[0];
  if (!user) {
    return bettingRedirect(req, { error: "no_user" });
  }

  const service = createServiceClient();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const { error: upsertError } = await service.from("twitch_tokens").upsert(
    {
      broadcaster_id: user.id,
      broadcaster_login: user.login,
      broadcaster_name: user.display_name,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      scopes: tokenData.scope.join(" "),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "broadcaster_id" }
  );

  if (upsertError) {
    console.error("twitch_tokens upsert:", upsertError);
    return bettingRedirect(req, { error: "db_save", detail: upsertError.message });
  }

  try {
    await ensurePredictionEventSub(user.id);
  } catch (e) {
    console.warn("EventSub registration after OAuth:", e);
  }

  return bettingRedirect(req, { connected: "1" });
  } catch (e) {
    console.error("Twitch OAuth callback:", e);
    const msg = e instanceof Error ? e.message : "callback_failed";
    return bettingRedirect(req, { error: "config", detail: msg });
  }
}
