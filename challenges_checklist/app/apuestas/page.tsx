import Link from "next/link";
import PageBackground from "@/app/components/PageBackground";
import TopNav from "@/app/components/TopNav";
import { createServiceClient } from "@/app/lib/supabase-service";
import { POOL_OUTCOMES_EMBED } from "@/app/lib/twitch/betting-weeks";
import { processPendingResolves } from "@/app/lib/twitch/resolve-pool";
import {
  blueButton,
  contentWrap,
  fnt,
  fs,
  pageMain,
  panel,
  progressFill,
  progressTrack,
  titleFont,
} from "@/app/lib/theme";

export const dynamic = "force-dynamic";

export default async function ApuestasPage() {
  await processPendingResolves();

  const service = createServiceClient();

  const { data: pool } = await service
    .from("betting_pools")
    .select(
      `
      *,
      seasons ( code, display_name ),
      ${POOL_OUTCOMES_EMBED} ( week_id, week_number, outcome_title, twitch_outcome_id ),
      betting_raffle_entries ( twitch_display_name, twitch_login, points_wagered )
    `
    )
    .in("status", ["open", "locked", "pending_resolve", "resolved"])
    .order("opened_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let weekProgress: { week_number: number; pct: number; outcome_title: string }[] = [];

  if (pool) {
    const { data: weeks } = await service
      .from("challenge_weeks")
      .select("id, week_number")
      .eq("season_id", pool.season_id)
      .order("week_number");

    const outcomes = (pool.betting_pool_outcomes ?? []) as {
      week_id: string;
      week_number: number;
      outcome_title: string;
    }[];

    for (const w of weeks ?? []) {
      const { data: pct } = await service.rpc("week_completion_pct", {
        p_week_id: w.id,
        p_mode: pool.win_mode,
      });
      const outcome = outcomes.find((o) => o.week_id === w.id);
      weekProgress.push({
        week_number: w.week_number,
        pct: Number(pct ?? 0),
        outcome_title: outcome?.outcome_title ?? `Semana ${w.week_number}`,
      });
    }
  }

  const winModeLabel =
    pool?.win_mode === "normales"
      ? "Primera semana con todos los desafíos normales completos"
      : "Primera semana con normales y prestigio al 100%";

  const statusLabels: Record<string, string> = {
    open: "Apuestas abiertas — canjea en Predictions del canal",
    locked: "Apuestas cerradas — esperando semana ganadora",
    pending_resolve: "Resolviendo apuesta…",
    resolved: "Apuesta resuelta",
  };

  return (
    <main style={pageMain}>
      <PageBackground />
      <div style={contentWrap}>
        <TopNav
          tabs={[
            { label: "Checklist", href: "/" },
            { label: "Apuestas", href: "/apuestas", active: true },
          ]}
        />

        <header style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: titleFont,
              fontSize: fs(28, 44),
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Apuestas semanales
          </h1>
        </header>

        {!pool ? (
          <section style={panel}>
            <p style={{ color: fnt.textDim, margin: 0 }}>
              No hay apuesta activa. El supervisor abrirá la prediction al inicio del directo.
            </p>
          </section>
        ) : (
          <>
            <section style={{ ...panel, marginBottom: 20 }}>
              <p
                style={{
                  color: fnt.yellow,
                  fontFamily: titleFont,
                  fontSize: fs(16, 22),
                  marginTop: 0,
                }}
              >
                {pool.title}
              </p>
              <p style={{ color: fnt.textDim, margin: "8px 0" }}>{winModeLabel}</p>
              <p style={{ color: fnt.textMuted, fontSize: fs(13, 15) }}>
                {statusLabels[pool.status] ?? pool.status}
              </p>
              {pool.status === "open" && (
                <p style={{ color: fnt.textDim, marginTop: 12 }}>
                  Apuesta en el chat de Twitch con Channel Points (Predictions).
                </p>
              )}
            </section>

            <section style={{ ...panel, marginBottom: 20 }}>
              <h2
                style={{
                  fontFamily: titleFont,
                  fontSize: fs(18, 24),
                  marginTop: 0,
                }}
              >
                Progreso por semana
              </h2>
              <div style={{ display: "grid", gap: 10 }}>
                {weekProgress.map((w) => (
                  <div key={w.week_number}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                        fontSize: fs(13, 15),
                      }}
                    >
                      <span>{w.outcome_title}</span>
                      <span>{w.pct}%</span>
                    </div>
                    <div style={progressTrack}>
                      <div style={progressFill(Math.min(100, w.pct))} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {pool.status === "resolved" && pool.raffle_winner_display_name && (
              <section style={panel}>
                <h2
                  style={{
                    fontFamily: titleFont,
                    fontSize: fs(18, 24),
                    marginTop: 0,
                    color: fnt.gold,
                  }}
                >
                  Ganador del sorteo
                </h2>
                <p style={{ fontSize: fs(16, 22), margin: 0 }}>
                  {pool.raffle_winner_display_name} (@{pool.raffle_winner_login})
                </p>
                <p style={{ color: fnt.textDim, fontSize: fs(13, 15), marginTop: 8 }}>
                  Premio extra del stream. Los Channel Points los reparte Twitch al acertar.
                </p>
              </section>
            )}
          </>
        )}

        <div style={{ marginTop: 24 }}>
          <Link href="/" style={{ ...blueButton, textDecoration: "none", display: "inline-block" }}>
            Ver checklist
          </Link>
        </div>
      </div>
    </main>
  );
}
