"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import PageBackground from "@/app/components/PageBackground";
import TopNav from "@/app/components/TopNav";
import type { PoolBetSummary } from "@/app/lib/twitch/betting-weeks";
import {
  blueButton,
  contentWrap,
  fnt,
  fs,
  pageMain,
  panel,
  pillTab,
  titleFont,
  yellowButton,
} from "@/app/lib/theme";

type Season = { id: string; code: string; display_name: string };
type Week = { id: string; week_number: number };
type Outcome = {
  id?: string;
  week_id: string | null;
  week_number: number | null;
  outcome_title: string;
  twitch_outcome_id?: string | null;
};
type Pool = {
  id: string;
  season_id: string;
  title: string;
  pool_kind?: string;
  win_mode: string;
  duration_seconds: number;
  status: string;
  twitch_prediction_id?: string | null;
  winning_week_id?: string | null;
  winning_outcome_id?: string | null;
  resolve_error?: string | null;
  raffle_winner_display_name?: string | null;
  raffle_winner_login?: string | null;
  betting_pool_outcomes?: Outcome[];
};
type WeekProgress = {
  week_id: string;
  week_number: number;
  pct: number;
  complete: boolean;
};
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

const cancelBtn: React.CSSProperties = {
  ...blueButton,
  background: "linear-gradient(180deg, #e1493a 0%, #b3271a 100%)",
  color: "white",
};

const statusLabel: Record<string, string> = {
  draft: "Borrador",
  open: "Abierta (apuestas)",
  locked: "Bloqueada",
  pending_resolve: "Resolviendo…",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

export default function BettingPanel({
  seasons,
  weeksBySeason,
}: {
  seasons: Season[];
  weeksBySeason: Record<string, Week[]>;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"weeks" | "custom" | "history">("weeks");
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [broadcaster, setBroadcaster] = useState<{ login: string; name: string } | null>(
    null
  );
  const [pool, setPool] = useState<Pool | null>(null);
  const [weekProgress, setWeekProgress] = useState<WeekProgress[]>([]);
  const [eligibleWeeks, setEligibleWeeks] = useState<Week[]>([]);
  const [canCreateWeekPool, setCanCreateWeekPool] = useState(true);
  const [betSummaries, setBetSummaries] = useState<PoolBetSummary[]>([]);
  const [logPoolId, setLogPoolId] = useState<string | null>(null);
  const [eventSub, setEventSub] = useState<EventSubStatus | null>(null);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null);
  const [twitchConfig, setTwitchConfig] = useState<{
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasServiceRole: boolean;
    ignoredLocalhostOnVercel: boolean;
  } | null>(null);

  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? "");
  const [title, setTitle] = useState("¿Qué semana se completa primero?");
  const [winMode, setWinMode] = useState<"normales" | "normales_prestigio">(
    "normales_prestigio"
  );
  const [durationSeconds, setDurationSeconds] = useState(600);
  const [selectedWeekIds, setSelectedWeekIds] = useState<Set<string>>(new Set());
  const [weekTitles, setWeekTitles] = useState<Record<string, string>>({});
  const [customOutcomes, setCustomOutcomes] = useState<string[]>([
    "Opción A",
    "Opción B",
  ]);
  const [customTitle, setCustomTitle] = useState("¿Quién gana?");
  const [manualWinnerId, setManualWinnerId] = useState("");

  const poolKind = tab === "custom" ? "custom" : "week_race";
  const weeks = weeksBySeason[seasonId] ?? [];

  const weekOutcomes = useMemo((): Outcome[] => {
    return eligibleWeeks
      .filter((w) => selectedWeekIds.has(w.id))
      .map((w) => ({
        week_id: w.id,
        week_number: w.week_number,
        outcome_title: weekTitles[w.id] ?? `Semana ${w.week_number}`,
      }));
  }, [eligibleWeeks, selectedWeekIds, weekTitles]);

  const selectedLog = useMemo(
    () => betSummaries.find((s) => s.pool_id === logPoolId) ?? betSummaries[0] ?? null,
    [betSummaries, logPoolId]
  );

  const syncEligibleSelection = useCallback(
    (eligible: Week[], titles?: Record<string, string>) => {
      setEligibleWeeks(eligible);
      setSelectedWeekIds(new Set(eligible.map((w) => w.id)));
      if (titles) {
        setWeekTitles(titles);
      } else {
        const map: Record<string, string> = {};
        for (const w of eligible) map[w.id] = `Semana ${w.week_number}`;
        setWeekTitles(map);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/betting/status?season_id=${encodeURIComponent(seasonId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Error al cargar estado de apuestas");
        return;
      }
      setTwitchConnected(data.twitchConnected);
      setBroadcaster(data.broadcaster);
      setEventSub(data.eventSub ?? null);
      setOauthRedirectUri(data.oauthRedirectUri ?? null);
      setTwitchConfig(data.twitchConfig ?? null);
      setWeekProgress(data.weekProgress ?? []);
      setCanCreateWeekPool(data.canCreateWeekPool ?? false);
      setBetSummaries(data.betSummaries ?? []);
      if (!logPoolId && data.betSummaries?.[0]?.pool_id) {
        setLogPoolId(data.betSummaries[0].pool_id);
      }

      const active = data.activePool as Pool | null;
      setPool(active);

      if (data.eligibleWeeks?.length) {
        if (active?.status === "draft" && active.pool_kind !== "custom") {
          const titles: Record<string, string> = {};
          for (const o of active.betting_pool_outcomes ?? []) {
            if (o.week_id) titles[o.week_id] = o.outcome_title;
          }
          const ids = new Set(
            (active.betting_pool_outcomes ?? [])
              .map((o) => o.week_id)
              .filter(Boolean) as string[]
          );
          setEligibleWeeks(data.eligibleWeeks);
          setSelectedWeekIds(
            ids.size > 0 ? ids : new Set(data.eligibleWeeks.map((w: Week) => w.id))
          );
          setWeekTitles((prev) => ({ ...prev, ...titles }));
        } else if (!active || active.status !== "draft") {
          syncEligibleSelection(data.eligibleWeeks);
        }
      }

      if (active?.status === "draft") {
        setSeasonId(active.season_id);
        if (active.pool_kind === "custom") {
          setTab("custom");
          setCustomTitle(active.title);
          setDurationSeconds(active.duration_seconds);
          setCustomOutcomes(
            (active.betting_pool_outcomes ?? []).map((o) => o.outcome_title)
          );
        } else {
          setTab("weeks");
          setTitle(active.title);
          setWinMode(active.win_mode as "normales" | "normales_prestigio");
          setDurationSeconds(active.duration_seconds);
        }
      }
    } catch {
      /* ignore */
    }
  }, [seasonId, logPoolId, syncEligibleSelection]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      setMessage("Twitch conectado correctamente.");
      window.history.replaceState({}, "", "/admin/betting");
    }
  }, []);

  useEffect(() => {
    if (winMode && seasonId) {
      void fetch(`/api/admin/betting/status?season_id=${seasonId}`).then(async (res) => {
        const data = await res.json();
        if (data.eligibleWeeks && (!pool || pool.status !== "draft")) {
          syncEligibleSelection(data.eligibleWeeks);
          setCanCreateWeekPool(data.canCreateWeekPool);
        }
      });
    }
  }, [winMode, seasonId, pool?.status, syncEligibleSelection]);

  function toggleWeek(id: string) {
    setSelectedWeekIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 2) {
          setMessage("Debes dejar al menos 2 semanas en la apuesta.");
          return prev;
        }
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function startNewPool() {
    setPool(null);
    setMessage("");
    setManualWinnerId("");
  }

  async function saveDraft() {
    setLoading(true);
    setMessage("");
    const isCustom = poolKind === "custom";
    const outcomes = isCustom
      ? customOutcomes.map((t, i) => ({
          week_id: null,
          week_number: i + 1,
          outcome_title: t,
        }))
      : weekOutcomes;

    try {
      const res = await fetch("/api/admin/betting/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: pool?.status === "draft" ? pool.id : undefined,
          season_id: seasonId,
          pool_kind: poolKind,
          title: isCustom ? customTitle : title,
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
    const isCustom = poolKind === "custom";
    if (!isCustom && weekOutcomes.length < 2) {
      setMessage("Selecciona al menos 2 semanas sin completar.");
      return;
    }
    if (isCustom && customOutcomes.filter((t) => t.trim()).length < 2) {
      setMessage("Añade al menos 2 opciones.");
      return;
    }

    setLoading(true);
    try {
      let id = pool?.status === "draft" ? pool.id : undefined;
      if (!id) {
        const saveRes = await fetch("/api/admin/betting/pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            season_id: seasonId,
            pool_kind: poolKind,
            title: isCustom ? customTitle : title,
            win_mode: winMode,
            duration_seconds: durationSeconds,
            outcomes: isCustom
              ? customOutcomes.map((t, i) => ({
                  week_id: null,
                  week_number: i + 1,
                  outcome_title: t,
                }))
              : weekOutcomes,
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

  async function cancelBet() {
    if (!pool?.id) return;
    if (!confirm("¿Cancelar la apuesta en Twitch? Los puntos se devuelven a los viewers.")) {
      return;
    }
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
      startNewPool();
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function retryResolve(winningOutcomeId?: string) {
    if (!pool?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/betting/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: pool.id,
          winning_outcome_id: winningOutcomeId,
        }),
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

  const canEdit = !pool || pool.status === "draft";
  const hasActivePool = pool && ["open", "locked", "pending_resolve"].includes(pool.status);
  const showCancel =
    pool && ["open", "locked"].includes(pool.status) && pool.twitch_prediction_id;

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
            Predictions de Channel Points · resolución automática (semanas) o manual (libre)
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
              whiteSpace: "pre-wrap",
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
                <div style={{ marginTop: 12, fontSize: fs(12, 14), color: fnt.textDim }}>
                  EventSub:{" "}
                  {eventSub.progress && eventSub.lock ? (
                    <span style={{ color: fnt.green }}>activo</span>
                  ) : (
                    <>
                      <span style={{ color: fnt.yellow }}>incompleto</span>
                      <button
                        type="button"
                        style={{ ...blueButton, marginLeft: 8 }}
                        disabled={loading}
                        onClick={registerEventSub}
                      >
                        Registrar
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <a href="/api/twitch/oauth/start" style={yellowButton}>
              Conectar Twitch
            </a>
          )}
        </section>

        {pool && pool.status !== "draft" && (
          <section style={{ ...panel, marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <h2 style={{ fontFamily: titleFont, fontSize: fs(18, 24), margin: 0 }}>
                {pool.title} — {statusLabel[pool.status] ?? pool.status}
              </h2>
              {pool.pool_kind === "custom" && (
                <span style={{ color: fnt.textMuted, fontSize: fs(12, 14) }}>Apuesta libre</span>
              )}
            </div>
            {pool.resolve_error && (
              <p style={{ color: fnt.red }}>Error: {pool.resolve_error}</p>
            )}
            {pool.status === "resolved" && pool.raffle_winner_display_name && (
              <p style={{ color: fnt.gold, fontSize: fs(16, 22) }}>
                Ganador sorteo: {pool.raffle_winner_display_name} (@
                {pool.raffle_winner_login})
              </p>
            )}
            {pool.pool_kind !== "custom" && weekProgress.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
                {weekProgress.map((w) => (
                  <div key={w.week_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        width: 100,
                        fontSize: fs(13, 15),
                        color: w.complete ? fnt.green : undefined,
                      }}
                    >
                      Semana {w.week_number}
                      {w.complete ? " ✓" : ""}
                    </span>
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
                          background: w.complete ? fnt.green : fnt.fill,
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {showCancel && (
                <button type="button" style={cancelBtn} disabled={loading} onClick={cancelBet}>
                  Cancelar apuesta
                </button>
              )}
              {pool.pool_kind === "custom" &&
                ["open", "locked"].includes(pool.status) &&
                (pool.betting_pool_outcomes?.length ?? 0) > 0 && (
                  <>
                    <select
                      value={manualWinnerId}
                      onChange={(e) => setManualWinnerId(e.target.value)}
                      style={{ ...inputStyle, width: "auto", minWidth: 180 }}
                    >
                      <option value="">Opción ganadora…</option>
                      {(pool.betting_pool_outcomes ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.outcome_title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={blueButton}
                      disabled={loading || !manualWinnerId}
                      onClick={() => retryResolve(manualWinnerId)}
                    >
                      Resolver y sortear
                    </button>
                  </>
                )}
              {(pool.status === "pending_resolve" || pool.resolve_error) && (
                <button
                  type="button"
                  style={blueButton}
                  disabled={loading}
                  onClick={() => retryResolve()}
                >
                  Reintentar resolver / sorteo
                </button>
              )}
              {!hasActivePool && (
                <button type="button" style={yellowButton} onClick={startNewPool}>
                  Nueva apuesta
                </button>
              )}
            </div>
          </section>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button type="button" style={pillTab(tab === "weeks")} onClick={() => setTab("weeks")}>
            Por semanas
          </button>
          <button type="button" style={pillTab(tab === "custom")} onClick={() => setTab("custom")}>
            Apuesta libre
          </button>
          <button
            type="button"
            style={pillTab(tab === "history")}
            onClick={() => setTab("history")}
          >
            Historial
          </button>
          {canEdit && !hasActivePool && (
            <button type="button" style={{ ...yellowButton, marginLeft: "auto" }} onClick={startNewPool}>
              + Nueva apuesta
            </button>
          )}
        </div>

        {tab === "history" ? (
          <section style={panel}>
            <h2 style={{ fontFamily: titleFont, fontSize: fs(18, 24), marginTop: 0 }}>
              Historial y apuestas
            </h2>
            <p style={{ color: fnt.textMuted, fontSize: fs(12, 14) }}>
              Datos de EventSub (top predictors de Twitch). No incluye todos los viewers, solo los
              que Twitch reporta.
            </p>
            {betSummaries.length === 0 ? (
              <p style={{ color: fnt.textDim }}>Aún no hay apuestas registradas.</p>
            ) : (
              <>
                <select
                  value={logPoolId ?? ""}
                  onChange={(e) => setLogPoolId(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 480, marginBottom: 16 }}
                >
                  {betSummaries.map((s) => (
                    <option key={s.pool_id} value={s.pool_id}>
                      {s.title} ({statusLabel[s.status] ?? s.status}) — {s.total_bettors}{" "}
                      apostadores
                    </option>
                  ))}
                </select>
                {selectedLog && (
                  <div style={{ display: "grid", gap: 20 }}>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                      <span>
                        <strong>{selectedLog.total_bettors}</strong> apostadores
                      </span>
                      <span>
                        <strong>{selectedLog.total_points.toLocaleString()}</strong> puntos total
                      </span>
                    </div>
                    {selectedLog.top_bettors.length > 0 && (
                      <div>
                        <h3 style={{ fontFamily: titleFont, fontSize: fs(16, 20) }}>
                          Top apostadores
                        </h3>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs(13, 15) }}>
                          <thead>
                            <tr style={{ color: fnt.textMuted, textAlign: "left" }}>
                              <th style={{ padding: "6px 8px" }}>#</th>
                              <th style={{ padding: "6px 8px" }}>Usuario</th>
                              <th style={{ padding: "6px 8px" }}>Puntos</th>
                              <th style={{ padding: "6px 8px" }}>Apuestas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedLog.top_bettors.map((u, i) => (
                              <tr key={u.twitch_user_id} style={{ borderTop: `1px solid ${fnt.border}` }}>
                                <td style={{ padding: "8px" }}>{i + 1}</td>
                                <td style={{ padding: "8px" }}>
                                  {u.twitch_display_name ?? u.twitch_login ?? u.twitch_user_id}
                                  {u.twitch_login && (
                                    <span style={{ color: fnt.textMuted }}> @{u.twitch_login}</span>
                                  )}
                                </td>
                                <td style={{ padding: "8px" }}>{u.total_points.toLocaleString()}</td>
                                <td style={{ padding: "8px" }}>{u.bets_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {selectedLog.bets.length > 0 && (
                      <div>
                        <h3 style={{ fontFamily: titleFont, fontSize: fs(16, 20) }}>
                          Detalle de apuestas
                        </h3>
                        <div style={{ maxHeight: 320, overflow: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs(12, 14) }}>
                            <thead>
                              <tr style={{ color: fnt.textMuted, textAlign: "left" }}>
                                <th style={{ padding: "6px 8px" }}>Usuario</th>
                                <th style={{ padding: "6px 8px" }}>Opción</th>
                                <th style={{ padding: "6px 8px" }}>Puntos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedLog.bets.map((b, i) => (
                                <tr
                                  key={`${b.twitch_user_id}-${b.twitch_outcome_id}-${i}`}
                                  style={{ borderTop: `1px solid ${fnt.border}` }}
                                >
                                  <td style={{ padding: "6px 8px" }}>
                                    {b.twitch_display_name ?? b.twitch_login}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>{b.outcome_title ?? "—"}</td>
                                  <td style={{ padding: "6px 8px" }}>{b.points_wagered}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section style={panel}>
            <h2 style={{ fontFamily: titleFont, fontSize: fs(18, 24), marginTop: 0 }}>
              {tab === "custom" ? "Nueva apuesta libre" : "Apuesta por semanas"}
            </h2>

            {hasActivePool && (
              <p style={{ color: fnt.yellow }}>
                Hay una apuesta activa. Cancélala o espera a resolverla antes de crear otra.
              </p>
            )}

            <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
              <label>
                <span style={{ display: "block", marginBottom: 4, color: fnt.textDim }}>
                  Temporada
                </span>
                <select
                  value={seasonId}
                  disabled={!canEdit || !!hasActivePool}
                  onChange={(e) => setSeasonId(e.target.value)}
                  style={inputStyle}
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? s.code}
                    </option>
                  ))}
                </select>
              </label>

              {tab === "weeks" ? (
                <>
                  <label>
                    <span style={{ display: "block", marginBottom: 4, color: fnt.textDim }}>
                      Nombre de la apuesta (máx. 45)
                    </span>
                    <input
                      value={title}
                      disabled={!canEdit || !!hasActivePool}
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
                      disabled={!canEdit || !!hasActivePool}
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
                      Semanas en juego ({selectedWeekIds.size} de {eligibleWeeks.length}{" "}
                      pendientes, mín. 2)
                    </span>
                    {!canCreateWeekPool && (
                      <p style={{ color: fnt.red }}>
                        Solo queda{eligibleWeeks.length === 1 ? "" : "n"}{" "}
                        {eligibleWeeks.length} semana(s) sin completar. No se puede abrir otra
                        apuesta por semanas.
                      </p>
                    )}
                    <div style={{ display: "grid", gap: 8 }}>
                      {eligibleWeeks.map((w) => {
                        const on = selectedWeekIds.has(w.id);
                        return (
                          <div
                            key={w.id}
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              opacity: on ? 1 : 0.55,
                            }}
                          >
                            <button
                              type="button"
                              disabled={!canEdit || !!hasActivePool}
                              onClick={() => toggleWeek(w.id)}
                              style={{
                                ...yellowButton,
                                padding: "4px 10px",
                                minWidth: 36,
                                opacity: on ? 1 : 0.5,
                              }}
                            >
                              {on ? "✓" : "○"}
                            </button>
                            <span style={{ width: 28, color: fnt.textMuted }}>{w.week_number}</span>
                            <input
                              value={weekTitles[w.id] ?? `Semana ${w.week_number}`}
                              disabled={!canEdit || !on || !!hasActivePool}
                              maxLength={25}
                              onChange={(e) =>
                                setWeekTitles((prev) => ({
                                  ...prev,
                                  [w.id]: e.target.value,
                                }))
                              }
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                        );
                      })}
                      {eligibleWeeks.length === 0 && (
                        <p style={{ color: fnt.textDim }}>Todas las semanas están completadas.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    <span style={{ display: "block", marginBottom: 4, color: fnt.textDim }}>
                      Pregunta / título (máx. 45)
                    </span>
                    <input
                      value={customTitle}
                      disabled={!canEdit || !!hasActivePool}
                      maxLength={45}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                  <div>
                    <span style={{ display: "block", marginBottom: 8, color: fnt.textDim }}>
                      Opciones (2–10, sin ligar a semanas)
                    </span>
                    {customOutcomes.map((o, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input
                          value={o}
                          disabled={!canEdit || !!hasActivePool}
                          maxLength={25}
                          onChange={(e) => {
                            const next = [...customOutcomes];
                            next[i] = e.target.value;
                            setCustomOutcomes(next);
                          }}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        {canEdit && customOutcomes.length > 2 && !hasActivePool && (
                          <button
                            type="button"
                            style={cancelBtn}
                            onClick={() =>
                              setCustomOutcomes(customOutcomes.filter((_, j) => j !== i))
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {canEdit && customOutcomes.length < 10 && !hasActivePool && (
                      <button
                        type="button"
                        style={yellowButton}
                        onClick={() => setCustomOutcomes([...customOutcomes, `Opción ${customOutcomes.length + 1}`])}
                      >
                        + Añadir opción
                      </button>
                    )}
                  </div>
                </>
              )}

              <div>
                <span style={{ display: "block", marginBottom: 8, color: fnt.textDim }}>
                  Duración ventana de apuestas
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      disabled={!canEdit || !!hasActivePool}
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

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                {canEdit && !hasActivePool && (
                  <>
                    <button
                      type="button"
                      style={yellowButton}
                      disabled={loading}
                      onClick={saveDraft}
                    >
                      Guardar borrador
                    </button>
                    {twitchConnected && (
                      <button
                        type="button"
                        style={blueButton}
                        disabled={
                          loading ||
                          (tab === "weeks" && (!canCreateWeekPool || weekOutcomes.length < 2))
                        }
                        onClick={openBet}
                      >
                        Abrir apuesta en Twitch
                      </button>
                    )}
                  </>
                )}
                <Link href="/admin" style={{ ...yellowButton, textDecoration: "none" }}>
                  Volver a admin
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
