import { createHmac } from "crypto";

export type TwitchTokens = {
  broadcaster_id: string;
  broadcaster_login: string | null;
  broadcaster_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

/** Quita espacios/saltos de línea al copiar desde Vercel o .env */
function trimEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const v = raw.trim();
  return v || undefined;
}

export function twitchConfigStatus() {
  const clientId = trimEnv("TWITCH_CLIENT_ID");
  const clientSecret = trimEnv("TWITCH_CLIENT_SECRET");
  const serviceRole = trimEnv("SUPABASE_SERVICE_ROLE_KEY");
  const explicitAppUrl = trimEnv("NEXT_PUBLIC_APP_URL");
  const explicitRedirect = trimEnv("TWITCH_OAUTH_REDIRECT_URI");
  const base = appBaseUrl();
  const redirect = twitchRedirectUri();
  return {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    hasServiceRole: !!serviceRole,
    appBaseUrl: base,
    oauthRedirectUri: redirect,
    explicitAppUrl: explicitAppUrl ?? null,
    explicitRedirect: explicitRedirect ?? null,
    ignoredLocalhostOnVercel:
      isVercelProduction() &&
      (!!explicitAppUrl?.includes("localhost") ||
        !!explicitRedirect?.includes("localhost")),
  };
}

export function twitchClientId(): string {
  const id = trimEnv("TWITCH_CLIENT_ID");
  if (!id) throw new Error("TWITCH_CLIENT_ID not configured");
  return id;
}

export function twitchClientSecret(): string {
  const secret = trimEnv("TWITCH_CLIENT_SECRET");
  if (!secret) throw new Error("TWITCH_CLIENT_SECRET not configured");
  return secret;
}

function isVercelProduction(): boolean {
  return process.env.VERCEL === "1";
}

export function appBaseUrl(): string {
  const explicit = trimEnv("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "");
  if (explicit && !(isVercelProduction() && explicit.includes("localhost"))) {
    return explicit;
  }
  const vercelHost = trimEnv("VERCEL_URL")?.replace(/\/$/, "");
  if (vercelHost) {
    return `https://${vercelHost}`;
  }
  return explicit ?? "http://localhost:3000";
}

export function twitchRedirectUri(): string {
  const explicit = trimEnv("TWITCH_OAUTH_REDIRECT_URI");
  if (
    explicit &&
    !(isVercelProduction() && explicit.includes("localhost"))
  ) {
    return explicit;
  }
  return `${appBaseUrl()}/api/twitch/oauth/callback`;
}

export function eventsubCallbackUrl(): string {
  return `${appBaseUrl()}/api/twitch/eventsub`;
}

export function eventsubSecret(): string {
  const secret = trimEnv("TWITCH_EVENTSUB_SECRET");
  if (!secret) throw new Error("TWITCH_EVENTSUB_SECRET not configured");
  return secret;
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
  const prediction = data.data?.[0];
  if (!prediction?.id) {
    throw new Error("Twitch no devolvió la predicción creada");
  }
  return prediction;
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

let appTokenCache: { token: string; expires: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  if (appTokenCache && appTokenCache.expires > Date.now() + 60_000) {
    return appTokenCache.token;
  }
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: twitchClientId(),
      client_secret: twitchClientSecret(),
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Twitch app token failed: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appTokenCache = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type EventSubSubscription = {
  id: string;
  type: string;
  status: string;
  condition: { broadcaster_user_id?: string };
  transport?: { method: string; callback?: string };
};

export async function listEventSubSubscriptions(
  appToken?: string
): Promise<EventSubSubscription[]> {
  const token = appToken ?? (await getAppAccessToken());
  const data = await helixFetch<{ data: EventSubSubscription[] }>(
    "/eventsub/subscriptions?first=100",
    { method: "GET", accessToken: token }
  );
  return data.data ?? [];
}

async function createEventSubSubscription(
  appToken: string,
  type: "channel.prediction.progress" | "channel.prediction.lock",
  broadcasterId: string
): Promise<EventSubSubscription> {
  const body = {
    type,
    version: "1",
    condition: { broadcaster_user_id: broadcasterId },
    transport: {
      method: "webhook",
      callback: eventsubCallbackUrl(),
      secret: eventsubSecret(),
    },
  };
  const data = await helixFetch<{ data: EventSubSubscription[] }>(
    "/eventsub/subscriptions",
    {
      method: "POST",
      accessToken: appToken,
      body: JSON.stringify(body),
    }
  );
  return data.data[0];
}

export type EnsureEventSubResult = {
  callback: string;
  created: string[];
  existing: string[];
  missingSecret?: boolean;
};

const PREDICTION_EVENT_TYPES = [
  "channel.prediction.progress",
  "channel.prediction.lock",
] as const;

export async function ensurePredictionEventSub(
  broadcasterId: string
): Promise<EnsureEventSubResult> {
  const callback = eventsubCallbackUrl();
  if (!process.env.TWITCH_EVENTSUB_SECRET) {
    return { callback, created: [], existing: [], missingSecret: true };
  }

  const appToken = await getAppAccessToken();
  const subs = await listEventSubSubscriptions(appToken);
  const created: string[] = [];
  const existing: string[] = [];

  for (const type of PREDICTION_EVENT_TYPES) {
    const found = subs.some(
      (s) =>
        s.type === type &&
        s.status === "enabled" &&
        s.condition?.broadcaster_user_id === broadcasterId &&
        s.transport?.callback === callback
    );
    if (found) {
      existing.push(type);
      continue;
    }
    await createEventSubSubscription(appToken, type, broadcasterId);
    created.push(type);
  }

  return { callback, created, existing };
}

export async function getPredictionEventSubStatus(broadcasterId: string): Promise<{
  callback: string;
  configured: boolean;
  progress: boolean;
  lock: boolean;
}> {
  const callback = eventsubCallbackUrl();
  if (!process.env.TWITCH_EVENTSUB_SECRET) {
    return { callback, configured: false, progress: false, lock: false };
  }
  const subs = await listEventSubSubscriptions();
  const match = (type: string) =>
    subs.some(
      (s) =>
        s.type === type &&
        s.status === "enabled" &&
        s.condition?.broadcaster_user_id === broadcasterId &&
        s.transport?.callback === callback
    );
  return {
    callback,
    configured: true,
    progress: match("channel.prediction.progress"),
    lock: match("channel.prediction.lock"),
  };
}

export function verifyEventSubSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(messageId + timestamp + body).digest("hex");
  return expected === signature;
}
