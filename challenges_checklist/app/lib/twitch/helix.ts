import { createHmac } from "crypto";

export type TwitchTokens = {
  broadcaster_id: string;
  broadcaster_login: string | null;
  broadcaster_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export function twitchClientId(): string {
  const id = process.env.TWITCH_CLIENT_ID;
  if (!id) throw new Error("TWITCH_CLIENT_ID not configured");
  return id;
}

export function twitchClientSecret(): string {
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!secret) throw new Error("TWITCH_CLIENT_SECRET not configured");
  return secret;
}

export function twitchRedirectUri(): string {
  return (
    process.env.TWITCH_OAUTH_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/twitch/oauth/callback`
  );
}

export function twitchOAuthScopes(): string[] {
  return ["channel:manage:predictions", "channel:read:predictions"];
}

export async function refreshTwitchTokens(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string[] }> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: twitchClientId(),
      client_secret: twitchClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Twitch token refresh failed: ${await res.text()}`);
  }
  return res.json();
}

export async function getValidTwitchTokens(): Promise<TwitchTokens | null> {
  const { createServiceClient } = await import("@/app/lib/supabase-service");
  const service = createServiceClient();
  const { data, error } = await service.from("twitch_tokens").select("*").limit(1).maybeSingle();
  if (error || !data) return null;

  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return data as TwitchTokens;
  }

  const refreshed = await refreshTwitchTokens(data.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { data: updated, error: upErr } = await service
    .from("twitch_tokens")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpires,
      scopes: refreshed.scope.join(" "),
      updated_at: new Date().toISOString(),
    })
    .eq("broadcaster_id", data.broadcaster_id)
    .select("*")
    .single();

  if (upErr || !updated) throw new Error("Failed to persist refreshed Twitch tokens");
  return updated as TwitchTokens;
}

export async function helixFetch<T>(
  path: string,
  options: RequestInit & { accessToken: string }
): Promise<T> {
  const url = path.startsWith("http") ? path : `https://api.twitch.tv/helix${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Client-Id": twitchClientId(),
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Twitch Helix ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type HelixOutcome = { id: string; title: string; users: number; channel_points: number };
export type HelixPredictor = {
  user_id: string;
  user_login: string;
  user_name: string;
  channel_points_used: number;
  channel_points_won: number | null;
};

export type HelixPrediction = {
  id: string;
  broadcaster_id: string;
  title: string;
  winning_outcome_id: string | null;
  status: string;
  outcomes: (HelixOutcome & { top_predictors: HelixPredictor[] | null })[];
};

export async function createPrediction(
  tokens: TwitchTokens,
  title: string,
  outcomes: { title: string }[],
  predictionWindowSeconds: number
): Promise<HelixPrediction> {
  const body = {
    broadcaster_id: tokens.broadcaster_id,
    title: title.slice(0, 45),
    outcomes: outcomes.map((o) => ({ title: o.title.slice(0, 25) })),
    prediction_window: predictionWindowSeconds,
  };
  const data = await helixFetch<{ data: HelixPrediction[] }>("/predictions", {
    method: "POST",
    accessToken: tokens.access_token,
    body: JSON.stringify(body),
  });
  return data.data[0];
}

export async function resolvePrediction(
  tokens: TwitchTokens,
  predictionId: string,
  winningOutcomeId: string
): Promise<HelixPrediction> {
  const body = {
    broadcaster_id: tokens.broadcaster_id,
    id: predictionId,
    status: "RESOLVED",
    winning_outcome_id: winningOutcomeId,
  };
  const data = await helixFetch<{ data: HelixPrediction[] }>("/predictions", {
    method: "PATCH",
    accessToken: tokens.access_token,
    body: JSON.stringify(body),
  });
  return data.data[0];
}

export async function cancelPrediction(
  tokens: TwitchTokens,
  predictionId: string
): Promise<HelixPrediction> {
  const body = {
    broadcaster_id: tokens.broadcaster_id,
    id: predictionId,
    status: "CANCELED",
  };
  const data = await helixFetch<{ data: HelixPrediction[] }>("/predictions", {
    method: "PATCH",
    accessToken: tokens.access_token,
    body: JSON.stringify(body),
  });
  return data.data[0];
}

export async function getPrediction(
  tokens: TwitchTokens,
  predictionId: string
): Promise<HelixPrediction | null> {
  const qs = new URLSearchParams({
    broadcaster_id: tokens.broadcaster_id,
    id: predictionId,
  });
  const data = await helixFetch<{ data: HelixPrediction[] }>(`/predictions?${qs}`, {
    method: "GET",
    accessToken: tokens.access_token,
  });
  return data.data[0] ?? null;
}

export function verifyEventSubSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) return false;
  const message = messageId + timestamp + body;
  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(messageId + timestamp + body).digest("hex");
  return expected === signature;
}
