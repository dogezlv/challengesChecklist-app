import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import {
  twitchClientId,
  twitchOAuthScopes,
  twitchRedirectUri,
} from "@/app/lib/twitch/helix";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("twitch_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: twitchClientId(),
    redirect_uri: twitchRedirectUri(),
    response_type: "code",
    scope: twitchOAuthScopes().join(" "),
    state,
  });

  return NextResponse.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
}
