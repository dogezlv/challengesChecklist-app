"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import MissionRow from "./MissionRow";
import { getMissionVisual } from "../lib/missionAssets";
import SearchBox from "./SearchBox";
import IncompleteOnlyToggle from "./IncompleteOnlyToggle";
import PrestigeViewToggle from "./PrestigeViewToggle";
import WeekTabs from "./WeekTabs";
import BattlePassBanner from "./BattlePassBanner";
import { fnt, fs, panel, weekAccent } from "../lib/theme";
import type { Season, Week } from "../lib/selection";
import {
  readTrackerViewPrefs,
  writeTrackerViewPrefs,
} from "../lib/trackerPrefs";
import {
  normalizeText,
  sortWeekChallenges,
  type Challenge,
  type LineRow,
} from "../lib/types";
import { applyChallengesRealtimeEvent } from "../lib/trackerSync";

// Vista pública de solo lectura: recibe TODA la temporada de una vez y cambia
// de semana en el cliente (sin ida al servidor). Se actualiza en vivo vía
// Realtime cuando el panel de supervisión o la BD cambian algo.
// Las fases futuras de una línea se ocultan hasta completar la anterior.
export default function ChallengeChecklist({
  initialChallenges,
  seasons,
  weeks,
  seasonCode,
  initialWeekNumber,
}: {
  initialChallenges: Challenge[];
  lines?: LineRow[];
  seasons: Season[];
  weeks: Week[];
  seasonCode: string;
  initialWeekNumber: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [challenges, setChallenges] = useState(initialChallenges);
  const [weekTab, setWeekTab] = useState(initialWeekNumber);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  // modo prestigio: muestra los desafíos extra (más difíciles) con tema teal
  const [prestige, setPrestige] = useState(false);
  const skipPrestigePersist = useRef(true);

  useEffect(() => {
    skipPrestigePersist.current = true;
    const { prestigeView } = readTrackerViewPrefs(
      seasonCode,
      weeks.map((w) => w.week_number)
    );
    setPrestige(prestigeView);
    skipPrestigePersist.current = false;
  }, [seasonCode, weeks]);

  // re-sincroniza cuando el servidor manda otra temporada (ajuste de estado
  // durante el render comparando la prop anterior, sin efecto)
  const [prevInitial, setPrevInitial] = useState(initialChallenges);
  if (prevInitial !== initialChallenges) {
    setPrevInitial(initialChallenges);
    setChallenges(initialChallenges);
  }

  const weekIds = useMemo(() => weeks.map((w) => w.id), [weeks]);
  const weekIdSet = useMemo(() => new Set(weekIds), [weekIds]);

  // Realtime: en vez de recargar TODA la temporada en cada cambio (lo que
  // multiplicaría las consultas por cada espectador anónimo del stream),
  // aplicamos directamente la fila del propio evento sobre el estado local.
  useEffect(() => {
    const channel = supabase
      .channel("challenges-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        (payload) => {
          setChallenges((prev) =>
            applyChallengesRealtimeEvent(
              prev,
              payload.eventType as "INSERT" | "UPDATE" | "DELETE",
              payload.old as Partial<Challenge>,
              payload.new as Partial<Challenge>,
              weekIdSet
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIdSet]);

  // Modo prestigio: tiñe el fondo animado (PageBackground) con el color de la
  // semana mediante un atributo + variable CSS en <html>. Se nota que estás en
  // prestigio sin recolorear toda la interfaz.
  useEffect(() => {
    const root = document.documentElement;
    if (prestige) {
      root.dataset.prestige = "on";
      root.style.setProperty("--prestige-accent", weekAccent(weekTab));
    } else {
      delete root.dataset.prestige;
    }
    return () => {
      delete root.dataset.prestige;
    };
  }, [prestige, weekTab]);

  const query = normalizeText(search.trim());

  // de cada línea de fases mostramos SOLO la fase actual: la primera
  // incompleta o, si ya están todas completas, la última (como completada).
  // Así las fases ya superadas no se acumulan en la lista.
  function currentPhaseIds(weekChalls: Challenge[]) {
    const byLine = new Map<string, Challenge[]>();
    for (const c of weekChalls) {
      if (!c.line_id) continue;
      const list = byLine.get(c.line_id) ?? [];
      list.push(c);
      byLine.set(c.line_id, list);
    }
    const show = new Set<string>();
    byLine.forEach((list) => {
      const sorted = [...list].sort(
        (a, b) => (a.phase_order ?? 0) - (b.phase_order ?? 0)
      );
      const current =
        sorted.find((c) => !c.is_completed) ?? sorted[sorted.length - 1];
      if (current) show.add(current.id);
    });
    return show;
  }

  function visibleWeekChallenges(week: Week) {
    const weekChalls = challenges.filter(
      (c) => c.week_id === week.id && !c.is_meta && !!c.is_prestige === prestige
    );
    const phaseShow = currentPhaseIds(weekChalls);
    return sortWeekChallenges(weekChalls).filter(
      (c) =>
        (!onlyIncomplete || !c.is_completed) &&
        (!c.line_id || phaseShow.has(c.id)) &&
        (!query || normalizeText(c.description).includes(query))
    );
  }

  // ¿el prestigio de la semana está desbloqueado? Todos los normales hechos Y
  // ninguno completado en la partida AÚN activa (completed_in_match no nulo):
  // si la semana se cierra dentro de una partida, el prestigio se desbloquea
  // recién a partir de la SIGUIENTE (end_active_match limpia la columna).
  function weekUnlocked(week: Week) {
    const normals = challenges.filter(
      (c) => c.week_id === week.id && !c.is_meta && !c.is_prestige
    );
    return (
      normals.length > 0 &&
      normals.every((c) => c.is_completed && !c.completed_in_match)
    );
  }

  function weekMetaChallenge(week: Week) {
    const meta = challenges.find((c) => c.week_id === week.id && c.is_meta);
    if (!meta) return null;
    if (onlyIncomplete && meta.is_completed) return null;
    if (query && !normalizeText(meta.description).includes(query)) return null;
    return meta;
  }

  // Porcentaje de la semana: los desafíos NORMALES llenan 0–100% y los de
  // PRESTIGIO suben de 100% a 200% (los prestigios solo se completan tras los
  // normales, así que su aporte llega después). El banner muestra hasta 200%.
  function weekStats(week: Week) {
    const normals = challenges.filter(
      (c) => c.week_id === week.id && !c.is_meta && !c.is_prestige
    );
    const prest = challenges.filter(
      (c) => c.week_id === week.id && !c.is_meta && c.is_prestige
    );
    const nDone = normals.filter((c) => c.is_completed).length;
    const pDone = prest.filter((c) => c.is_completed).length;
    const nPct = normals.length ? (nDone / normals.length) * 100 : 0;
    const pPct = prest.length ? (pDone / prest.length) * 100 : 0;
    return { total: normals.length, done: nDone, percent: nPct + pPct };
  }

  const tabWeek = weeks.find((w) => w.week_number === weekTab) ?? weeks[0];
  const viewWeeks = showAll ? weeks : tabWeek ? [tabWeek] : [];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <WeekTabs
        seasons={seasons}
        weeks={weeks}
        seasonCode={seasonCode}
        weekNumber={weekTab}
        allSelected={showAll}
        onSelectAll={() => setShowAll(true)}
        onSelectSeason={(code) => router.push(`/?season=${code}&week=1`)}
        onSelectWeek={(n) => {
          setShowAll(false);
          setWeekTab(n);
          window.history.replaceState(null, "", `/?season=${seasonCode}&week=${n}`);
        }}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ flex: "1 1 240px", maxWidth: 420 }}>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={
              showAll
                ? "Buscar en todas las semanas…"
                : `Buscar en la semana ${tabWeek?.week_number ?? ""}…`
            }
          />
        </div>
        <PrestigeViewToggle
          active={prestige}
          onToggle={() =>
            setPrestige((p) => {
              const next = !p;
              if (!skipPrestigePersist.current) {
                writeTrackerViewPrefs(seasonCode, { prestige: next });
              }
              return next;
            })
          }
        />
        <IncompleteOnlyToggle
          active={onlyIncomplete}
          onChange={setOnlyIncomplete}
        />
      </div>

      {viewWeeks.map((week) => {
        const items = visibleWeekChallenges(week);
        const meta = prestige ? null : weekMetaChallenge(week);
        if (showAll && items.length === 0 && !meta) return null;

        const stats = weekStats(week);
        // el color es SIEMPRE el de la semana; el prestigio NO lo vuelve teal,
        // solo "imbuye" más el recuadro (glow + borde más intenso)
        const accent = weekAccent(week.week_number);
        const unlocked = weekUnlocked(week);
        const rows = meta ? [meta, ...items] : items;

        return (
          // recuadro continuo: banner pegado a la caja de desafíos (estilo BP)
          <div
            key={week.id}
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: `1px solid ${accent}${prestige ? "aa" : "59"}`,
              boxShadow: prestige
                ? `0 8px 26px rgba(0,0,0,0.32), 0 0 36px ${accent}66, inset 0 0 0 1px ${accent}55`
                : "0 8px 26px rgba(0,0,0,0.32)",
            }}
          >
            <BattlePassBanner
              label={prestige ? "Misión de prestigio" : "Desafíos del pase de batalla"}
              title={week.display_name ?? `Semana ${week.week_number}`}
              subtitle={
                prestige
                  ? "Desafíos más difíciles de la semana"
                  : "Completa los objetivos para avanzar"
              }
              percent={stats.percent}
              accent={accent}
              prestige={prestige}
              flush
            />

            <div style={{ ...panel, borderRadius: 0, border: "none", padding: `${fs(6, 12)} ${fs(8, 18)}` }}>

              {rows.map((c, i) => (
                <MissionRow
                  key={c.id}
                  quest={c.description}
                  current={c.current_value ?? 0}
                  target={c.target_value ?? (c.is_meta ? 7 : 1)}
                  completed={c.is_completed}
                  meta={!!c.is_meta}
                  locked={prestige && !unlocked}
                  lockedLabel="Completa la misión normal para desbloquear el prestigio"
                  accent={accent}
                  first={i === 0}
                  visual={getMissionVisual(c)}
                />
              ))}

              {rows.length === 0 && (
                <p style={{ color: fnt.textDim, margin: 0, padding: `${fs(8, 14)} 0` }}>
                  {onlyIncomplete
                    ? "No quedan desafíos pendientes en esta semana."
                    : prestige
                      ? "Esta semana aún no tiene desafíos de prestigio."
                      : "No hay desafíos para mostrar."}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {(query || onlyIncomplete) &&
        viewWeeks.every((w) => visibleWeekChallenges(w).length === 0 && !weekMetaChallenge(w)) && (
          <p style={{ color: fnt.textDim, margin: 0 }}>
            {query
              ? `Ningún desafío coincide con "${search}".`
              : "No quedan desafíos pendientes en la selección actual."}
          </p>
        )}
    </div>
  );
}
