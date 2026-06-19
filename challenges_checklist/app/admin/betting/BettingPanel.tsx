"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import PageBackground from "@/app/components/PageBackground";
import TopNav from "@/app/components/TopNav";
import {
  blueButton,
  contentWrap,
  fnt,
  fs,
  pageMain,
  panel,
  titleFont,
  yellowButton,
} from "@/app/lib/theme";

type Season = { id: string; code: string; display_name: string };
type Week = { id: string; week_number: number };
type Outcome = {
  id?: string;
  week_id: string;
  week_number: number;
  outcome_title: string;
  twitch_outcome_id?: string | null;
};
type Pool = {
  id: string;
  season_id: string;
  title: string;
  win_mode: string;
  duration_seconds: number;
  status: string;
  twitch_prediction_id?: string | null;
  winning_week_id?: string | null;
  resolve_error?: string | null;
  raffle_winner_display_name?: string | null;
  raffle_winner_login?: string | null;
  betting_pool_outcomes?: Outcome[];
};
type WeekProgress = { week_id: string; week_number: number; pct: number };
type EventSubStatus = {
  callback: string;
  configured: boolean;
  progress: boolean;
  lock: boolean;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${fnt.border}`,
  background: "rgba(2, 14, 36, 0.6)",
  color: fnt.text,
  fontSize: fs(14, 16),
};

const DURATION_PRESETS = [
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

export default function BettingPanel({
  seasons,
  weeksBySeason,
}: {
  seasons: Season[];
  weeksBySeason: Record<string, Week[]>;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [broadcaster, setBroadcaster] = useState<{ login: string; name: string } | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [weekProgress, setWeekProgress] = useState<WeekProgress[]>([]);
  const [eventSub, setEventSub] = useState<EventSubStatus | null>(null);

  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? "");
  const [title, setTitle] = useState("¿Qué semana se completa primero?");
  const [winMode, setWinMode] = useState<"normales" | "normales_prestigio">("normales_prestigio");
  const [durationSeconds, setDurationSeconds] = useState(600);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const weeks = weeksBySeason[seasonId] ?? [];

  useEffect(() => {
    if (weeks.length && outcomes.length === 0) {
      setOutcomes(
        weeks.map((w) => ({
          week_id: w.id,
          week_number: w.week_number,
          outcome_title: `Semana ${w.week_number}`,
        }))
      );
    }
  }, [seasonId, weeks, outcomes.length]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/betting/status");
      if (!res.ok) return;
      const data = await res.json();
      setTwitchConnected(data.twitchConnected);
      setBroadcaster(data.broadcaster);
      setEventSub(data.eventSub ?? null);
      setWeekProgress(data.weekProgress ?? []);
      const active = data.activePool as Pool | null;
      setPool(active);
      if (active && active.status === "draft") {
        setSeasonId(active.season_id);
        setTitle(active.title);
        setWinMode(active.win_mode as "normales" | "normales_prestigio");
        setDurationSeconds(active.duration_seconds);
        if (active.betting_pool_outcomes?.length) {
          setOutcomes(active.betting_pool_outcomes);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") setMessage("Twitch conectado correctamente.");
    if (params.get("error")) setMessage(`Error OAuth: ${params.get("error")}`);
  }, []);

  async function saveDraft() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/betting/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: pool?.status === "draft" ? pool.id : undefined,
          season_id: seasonId,
          title,
          win_mode: winMode,
          duration_seconds: durationSeconds,
          outcomes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setPool(data.pool);
      setMessage("Configuración guardada.");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function openBet() {
    if (!pool?.id) {
      await saveDraft();
    }
    const poolId = pool?.id;
    if (!poolId && !pool) {
      setMessage("Guarda la config primero.");
      return;
    }
    setLoading(true);
    try {
      let id = poolId;
      if (!id) {
        const saveRes = await fetch("/api/admin/betting/pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            season_id: seasonId,
            title,
            win_mode: winMode,
            duration_seconds: durationSeconds,
            outcomes,
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error);
        id = saveData.pool.id;
      }
      const res = await fetch("/api/admin/betting/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al abrir");
      setMessage("Apuesta abierta en Twitch.");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function retryResolve() {
    if (!pool?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/betting/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: pool.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al resolver");
      setMessage(
        data.raffleWinner
          ? `Sorteo: ${data.raffleWinner.display_name ?? data.raffleWinner.login}`
          : "Resuelto (sin acertantes en sorteo)."
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function registerEventSub() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/betting/eventsub", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error EventSub");
      setMessage(
        data.created?.length
          ? `EventSub registrado: ${data.created.join(", ")}`
          : "EventSub ya estaba activo."
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function cancelBet() {
    if (!pool?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/betting/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: pool.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setMessage("Apuesta cancelada.");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const canEdit = !pool || pool.status === "draft";
  const statusLabel: Record<string, string> = {
    draft: "Borrador",
    open: "Abierta (apuestas)",
    locked: "Bloqueada",
    pending_resolve: "Resolviendo…",
    resolved: "Resuelta",
    cancelled: "Cancelada",
  };

  return (
    <main style={pageMain}>
      <PageBackground />
      <div style={contentWrap}>
        <TopNav
          tabs={[
            { label: "Checklist", href: "/" },
            { label: "Tracker", href: "/tracker" },
            { label: "Admin", href: "/admin" },
            { label: "Apuestas", href: "/admin/betting", active: true },
            { label: "Pública", href: "/apuestas" },
          ]}
          right={<LogoutButton />}
        />

        <header style={{ marginBottom: 20 }}>
          <h1
            style={{
              fontFamily: titleFont,
              fontSize: fs(28, 44),
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Apuestas Twitch
          </h1>
          <p style={{ color: fnt.textDim, marginTop: 8, fontSize: fs(14, 18) }}>
            Prediction al inicio del directo · resolución automática al completar la semana
            ganadora
          </p>
        </header>

        {message && (
          <p
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(4, 24, 58, 0.7)",
              border: `1px solid ${fnt.border}`,
              marginBottom: 16,
            }}
          >
            {message}
          </p>
        )}

        <section style={{ ...panel, marginBottom: 20 }}>
          <h2 style={{ fontFamily: titleFont, fontSize: fs(18, 24), marginTop: 0 }}>
            Twitch
          </h2>
          {twitchConnected && broadcaster ? (
            <>
              <p style={{ color: fnt.green }}>
                Conectado como {broadcaster.name} (@{broadcaster.login})
              </p>
              {eventSub && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${fnt.border}`,
                    background: "rgba(2, 14, 36, 0.45)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <span style={{ color: fnt.textDim, fontSize: fs(12, 14) }}>
                    Webhook EventSub (apuestas en vivo + sorteo)
                  </span>
                  <code
                    style={{
                      fontSize: fs(11, 13),
                      color: fnt.textMuted,
                      wordBreak: "break-all",
                    }}
                  >
                    {eventSub.callback}
                  </code>
                  {!eventSub.configured ? (
                    <p style={{ color: fnt.red, margin: 0 }}>
                      Falta TWITCH_EVENTSUB_SECRET en el servidor.
                    </p>
                  ) : eventSub.progress && eventSub.lock ? (
                    <p style={{ color: fnt.green, margin: 0 }}>
                      Suscripciones activas (progress + lock).
                    </p>
                  ) : (
                    <>
                      <p style={{ color: fnt.yellow, margin: 0 }}>
                        Faltan suscripciones EventSub
                        {!eventSub.progress ? " · progress" : ""}
                        {!eventSub.lock ? " · lock" : ""}.
                        En local necesitas URL pública (túnel o Vercel).
                      </p>
                      <button
                        type="button"
                        style={blueButton}
                        disabled={loading}
                        onClick={registerEventSub}
                      >
                        Registrar EventSub
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ color: fnt.textDim, marginBottom: 12 }}>
                El streamer debe autorizar la app una vez (solo Predictions).
              </p>
              <a href="/api/twitch/oauth/start" style={yellowButton}>
                Conectar Twitch
              </a>
            </>
          )}
        </section>

        {pool && pool.status !== "draft" && (
          <section style={{ ...panel, marginBottom: 20 }}>
            <h2 style={{ fontFamily: titleFont, fontSize: fs(18, 24), marginTop: 0 }}>
              Estado: {statusLabel[pool.status] ?? pool.status}
            </h2>
            {pool.resolve_error && (
              <p style={{ color: fnt.red }}>Error: {pool.resolve_error}</p>
            )}
            {pool.status === "resolved" && pool.raffle_winner_display_name && (
              <p style={{ color: fnt.gold, fontSize: fs(16, 22) }}>
                Ganador sorteo: {pool.raffle_winner_display_name} (@
                {pool.raffle_winner_login})
              </p>
            )}
            {weekProgress.length > 0 && (
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {weekProgress.map((w) => (
                  <div key={w.week_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 90, fontSize: fs(13, 15) }}>Semana {w.week_number}</span>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 4,
                        background: fnt.track,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, w.pct)}%`,
                          height: "100%",
                          background: fnt.fill,
                        }}
                      />
                    </div>
                    <span style={{ width: 48, textAlign: "right", fontSize: fs(12, 14) }}>
                      {w.pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(pool.status === "pending_resolve" || pool.resolve_error) && (
              <button
                type="button"
                style={{ ...blueButton, marginTop: 12 }}
                disabled={loading}
                onClick={retryResolve}
              >
                Reintentar resolver / sorteo
              </button>
            )}
            {pool.status === "open" && (
              <button
                type="button"
                style={{ ...blueButton, marginTop: 12, marginLeft: 8 }}
                disabled={loading}
                onClick={cancelBet}
              >
                Cancelar apuesta
              </button>
            )}
          </section>
        )}

        <section style={panel}>
          <h2 style={{ fontFamily: titleFont, fontSize: fs(18, 24), marginTop: 0 }}>
            Configuración
          </h2>

          <div style={{ display: "grid", gap: 14, maxWidth: 640 }}>
            <label>
              <span style={{ display: "block", marginBottom: 4, color: fnt.textDim }}>
                Temporada
              </span>
              <select
                value={seasonId}
                disabled={!canEdit}
                onChange={(e) => {
                  setSeasonId(e.target.value);
                  setOutcomes([]);
                }}
                style={inputStyle}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name ?? s.code}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 4, color: fnt.textDim }}>
                Nombre de la apuesta (máx. 45)
              </span>
              <input
                value={title}
                disabled={!canEdit}
                maxLength={45}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 4, color: fnt.textDim }}>
                Condición ganadora
              </span>
              <select
                value={winMode}
                disabled={!canEdit}
                onChange={(e) =>
                  setWinMode(e.target.value as "normales" | "normales_prestigio")
                }
                style={inputStyle}
              >
                <option value="normales">Solo desafíos normales</option>
                <option value="normales_prestigio">Normales + prestigio</option>
              </select>
            </label>

            <div>
              <span style={{ display: "block", marginBottom: 8, color: fnt.textDim }}>
                Duración ventana de apuestas
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    disabled={!canEdit}
                    style={{
                      ...yellowButton,
                      opacity: durationSeconds === p.value ? 1 : 0.6,
                    }}
                    onClick={() => setDurationSeconds(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span
                style={{
                  display: "block",
                  marginBottom: 8,
                  color: fnt.textDim,
                  fontFamily: titleFont,
                }}
              >
                Opciones (ligadas a semanas)
              </span>
              <div style={{ display: "grid", gap: 8 }}>
                {outcomes.map((o, i) => (
                  <div key={o.week_id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 28, color: fnt.textMuted }}>{o.week_number}</span>
                    <input
                      value={o.outcome_title}
                      disabled={!canEdit}
                      maxLength={25}
                      onChange={(e) => {
                        const next = [...outcomes];
                        next[i] = { ...o, outcome_title: e.target.value };
                        setOutcomes(next);
                      }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              {canEdit && (
                <button type="button" style={yellowButton} disabled={loading} onClick={saveDraft}>
                  Guardar borrador
                </button>
              )}
              {canEdit && twitchConnected && (
                <button type="button" style={blueButton} disabled={loading} onClick={openBet}>
                  Abrir apuesta (inicio directo)
                </button>
              )}
              <Link href="/admin" style={{ ...yellowButton, textDecoration: "none" }}>
                Volver a admin
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
