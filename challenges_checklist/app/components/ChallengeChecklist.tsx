"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import MissionRow from "./MissionRow";
import { getMissionVisual } from "../lib/missionAssets";
import SearchBox from "./SearchBox";
import IncompleteOnlyToggle from "./IncompleteOnlyToggle";
import PrestigeViewToggle from "./PrestigeViewToggle";
import WeekTabs from "./WeekTabs";
import BattlePassBanner from "./BattlePassBanner";
import { fnt, fs, panel, panelClassName, weekAccent } from "../lib/theme";
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
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [challenges, setChallenges] = useState(initialChallenges);
  const [weekTab, setWeekTab] = useState(initialWeekNumber);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  // modo prestigio: muestra los desafíos extra (más difíciles) con tema teal
  const [prestige, setPrestige] = useState(false);
  const skipPrestigePersist = useRef(true);
  const hasPrestige =
    seasons.find((s) => s.code === seasonCode)?.has_prestige ?? false;

  useEffect(() => {
    skipPrestigePersist.current = true;
    const { prestigeView } = readTrackerViewPrefs(
      seasonCode,
      weeks.map((w) => w.week_number)
    );
    setPrestige(hasPrestige ? prestigeView : false);
    skipPrestigePersist.current = false;
  }, [seasonCode, weeks, hasPrestige]);

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
  }, [supabase, weekIdSet]);

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

  const deferredSearch = useDeferredValue(search);
  const query = useMemo(
    () => normalizeText(deferredSearch.trim()),
    [deferredSearch]
  );

  const challengesByWeek = useMemo(() => {
    const map = new Map<string, Challenge[]>();
    for (const c of challenges) {
      if (!c.week_id) continue;
      const list = map.get(c.week_id) ?? [];
      list.push(c);
      map.set(c.week_id, list);
    }
    return map;
  }, [challenges]);

  const phaseShowByWeek = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const [weekId, weekChalls] of challengesByWeek) {
      const byLine = new Map<string, Challenge[]>();
      for (const c of weekChalls) {
        if (!c.line_id || c.is_meta) continue;
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
      out.set(weekId, show);
    }
    return out;
  }, [challengesByWeek]);

  const weekUnlockedMap = useMemo(() => {
    const out = new Map<string, boolean>();
    for (const week of weeks) {
      const weekChalls = challengesByWeek.get(week.id) ?? [];
      const normals = weekChalls.filter((c) => !c.is_meta && !c.is_prestige);
      out.set(
        week.id,
        normals.length > 0 &&
          normals.every((c) => c.is_completed && !c.completed_in_match)
      );
    }
    return out;
  }, [weeks, challengesByWeek]);

  const weekStatsMap = useMemo(() => {
    const out = new Map<string, { total: number; done: number; percent: number }>();
    for (const week of weeks) {
      const weekChalls = challengesByWeek.get(week.id) ?? [];
      const normals = weekChalls.filter((c) => !c.is_meta && !c.is_prestige);
      const prest = weekChalls.filter((c) => !c.is_meta && c.is_prestige);
      const nDone = normals.filter((c) => c.is_completed).length;
      const pDone = prest.filter((c) => c.is_completed).length;
      const nPct = normals.length ? (nDone / normals.length) * 100 : 0;
      const pPct = prest.length ? (pDone / prest.length) * 100 : 0;
      out.set(week.id, {
        total: normals.length,
        done: nDone,
        percent: nPct + pPct,
      });
    }
    return out;
  }, [weeks, challengesByWeek]);

  const visibleByWeek = useMemo(() => {
    const out = new Map<
      string,
      { items: Challenge[]; meta: Challenge | null }
    >();
    for (const week of weeks) {
      const weekChalls = challengesByWeek.get(week.id) ?? [];
      const phaseShow = phaseShowByWeek.get(week.id) ?? new Set<string>();
      const items = sortWeekChallenges(
        weekChalls.filter(
          (c) => !c.is_meta && !!c.is_prestige === prestige
        )
      ).filter(
        (c) =>
          (!onlyIncomplete || !c.is_completed) &&
          (!c.line_id || phaseShow.has(c.id)) &&
          (!query || normalizeText(c.description).includes(query))
      );
      const metaRow = weekChalls.find((c) => c.is_meta);
      const meta =
        prestige || !metaRow
          ? null
          : onlyIncomplete && metaRow.is_completed
            ? null
            : query && !normalizeText(metaRow.description).includes(query)
              ? null
              : metaRow;
      out.set(week.id, { items, meta });
    }
    return out;
  }, [
    weeks,
    challengesByWeek,
    phaseShowByWeek,
    prestige,
    onlyIncomplete,
    query,
  ]);

  const tabWeek = weeks.find((w) => w.week_number === weekTab) ?? weeks[0];
  const viewWeeks = showAll ? weeks : tabWeek ? [tabWeek] : [];

  const onSelectWeek = useCallback(
    (n: number) => {
      setShowAll(false);
      setWeekTab(n);
      window.history.replaceState(null, "", `/?season=${seasonCode}&week=${n}`);
    },
    [seasonCode]
  );

  const onSelectSeason = useCallback(
    (code: string) => router.push(`/?season=${code}&week=1`),
    [router]
  );

  const onSelectAll = useCallback(() => setShowAll(true), []);

  const togglePrestige = useCallback(() => {
    setPrestige((p) => {
      const next = !p;
      if (!skipPrestigePersist.current) {
        writeTrackerViewPrefs(seasonCode, { prestige: next });
      }
      return next;
    });
  }, [seasonCode]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <WeekTabs
        seasons={seasons}
        weeks={weeks}
        seasonCode={seasonCode}
        weekNumber={weekTab}
        allSelected={showAll}
        onSelectAll={onSelectAll}
        onSelectSeason={onSelectSeason}
        onSelectWeek={onSelectWeek}
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
        {hasPrestige && (
          <PrestigeViewToggle active={prestige} onToggle={togglePrestige} />
        )}
        <IncompleteOnlyToggle
          active={onlyIncomplete}
          onChange={setOnlyIncomplete}
        />
      </div>

      {viewWeeks.map((week) => {
        const { items, meta } = visibleByWeek.get(week.id) ?? {
          items: [],
          meta: null,
        };
        if (showAll && items.length === 0 && !meta) return null;

        const stats = weekStatsMap.get(week.id) ?? {
          total: 0,
          done: 0,
          percent: 0,
        };
        const accent = weekAccent(week.week_number);
        const unlocked = weekUnlockedMap.get(week.id) ?? false;
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

            <div
              className={panelClassName}
              style={{ ...panel, borderRadius: 0, border: "none", padding: `${fs(6, 12)} ${fs(8, 18)}` }}
            >

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
        viewWeeks.every((w) => {
          const v = visibleByWeek.get(w.id);
          return !v?.items.length && !v?.meta;
        }) && (
          <p style={{ color: fnt.textDim, margin: 0 }}>
              {query
                ? `Ningún desafío coincide con "${deferredSearch}".`
              : "No quedan desafíos pendientes en la selección actual."}
          </p>
        )}
    </div>
  );
}
