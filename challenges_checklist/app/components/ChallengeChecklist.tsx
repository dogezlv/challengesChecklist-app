"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import MissionCard from "./MissionCard";
import SearchBox from "./SearchBox";
import WeekTabs from "./WeekTabs";
import type { Season, Week } from "../lib/selection";
import {
  SCOPE_LABEL,
  computeLockedIds,
  normalizeText,
  sortWeekChallenges,
  type Challenge,
  type LineRow,
} from "../lib/types";

// Vista pública de solo lectura: recibe TODA la temporada de una vez y cambia
// de semana en el cliente (sin ida al servidor). Se actualiza en vivo vía
// Realtime cuando el panel de supervisión o la BD cambian algo.
// Las fases futuras de una línea se ocultan hasta completar la anterior.
export default function ChallengeChecklist({
  initialChallenges,
  lines,
  seasons,
  weeks,
  seasonCode,
  initialWeekNumber,
}: {
  initialChallenges: Challenge[];
  lines: LineRow[];
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

  // re-sincroniza cuando el servidor manda otra temporada (ajuste de estado
  // durante el render comparando la prop anterior, sin efecto)
  const [prevInitial, setPrevInitial] = useState(initialChallenges);
  if (prevInitial !== initialChallenges) {
    setPrevInitial(initialChallenges);
    setChallenges(initialChallenges);
  }

  const weekIds = useMemo(() => weeks.map((w) => w.id), [weeks]);

  useEffect(() => {
    async function loadChallenges() {
      if (!weekIds.length) return;
      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .in("week_id", weekIds)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setChallenges(data);
      }
    }

    const channel = supabase
      .channel("challenges-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        () => {
          loadChallenges();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIds.join(",")]);

  const lockedIds = useMemo(() => computeLockedIds(challenges), [challenges]);
  const query = normalizeText(search.trim());

  function lineName(lineId: string | null) {
    if (!lineId) return null;
    const name = lines.find((l) => l.id === lineId)?.name;
    if (!name) return null;
    return name.split(" — ")[1] ?? name;
  }

  // en el checklist las fases bloqueadas no se muestran: aparecen al
  // completar la fase anterior, ocupando el mismo lugar de su línea
  function visibleWeekChallenges(week: Week) {
    return sortWeekChallenges(
      challenges.filter((c) => c.week_id === week.id && !c.is_meta)
    ).filter(
      (c) =>
        !lockedIds.has(c.id) &&
        (!query || normalizeText(c.description).includes(query))
    );
  }

  function weekMetaCard(week: Week) {
    const meta = challenges.find((c) => c.week_id === week.id && c.is_meta);
    if (!meta) return null;
    if (query && !normalizeText(meta.description).includes(query)) return null;
    return (
      <MissionCard
        title={`Semana ${week.week_number} · Recompensa automática`}
        quest={meta.description}
        current={meta.current_value ?? 0}
        target={meta.target_value ?? 7}
        completed={meta.is_completed}
        meta
      />
    );
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

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={
          showAll
            ? "Buscar en todas las semanas…"
            : `Buscar en la semana ${tabWeek?.week_number ?? ""}…`
        }
      />

      {viewWeeks.map((week) => {
        const items = visibleWeekChallenges(week);
        const metaCard = weekMetaCard(week);
        if (showAll && items.length === 0 && !metaCard) return null;

        return (
          <div key={week.id} style={{ display: "grid", gap: 10 }}>
            {showAll && (
              <h2
                style={{
                  color: "#7ccafa",
                  margin: "8px 0 0",
                  fontSize: 16,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  fontWeight: 900,
                }}
              >
                {week.display_name ?? `Semana ${week.week_number}`}
              </h2>
            )}

            {metaCard}

            {items.map((challenge) => {
              const line = lineName(challenge.line_id);
              return (
                <MissionCard
                  key={challenge.id}
                  title={`${SCOPE_LABEL[challenge.match_scope]}${line ? ` · ${line}` : ""}`}
                  quest={challenge.description}
                  current={challenge.current_value ?? 0}
                  target={challenge.target_value ?? 1}
                  completed={challenge.is_completed}
                />
              );
            })}
          </div>
        );
      })}

      {query &&
        viewWeeks.every((w) => visibleWeekChallenges(w).length === 0 && !weekMetaCard(w)) && (
          <p style={{ color: "#9fc9f5", margin: 0 }}>
            Ningún desafío coincide con &quot;{search}&quot;.
          </p>
        )}
    </div>
  );
}
