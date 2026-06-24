"use client";

import type { ReactNode } from "react";
import type { Season, Week } from "../lib/selection";
import { fnt, fs, pillTab, titleFont } from "../lib/theme";

type SeasonWeekBase = {
  seasons: Season[];
  weeks: Week[];
  seasonCode: string;
  onSelectSeason: (code: string) => void;
};

type WeekTabsSingle = SeasonWeekBase & {
  multiSelect?: false;
  weekNumber: number;
  onSelectWeek: (weekNumber: number) => void;
  allSelected?: boolean;
  onSelectAll?: () => void;
};

type WeekTabsMulti = SeasonWeekBase & {
  multiSelect: true;
  selectedWeeks: number[];
  onToggleWeek: (weekNumber: number) => void;
  onSelectAllWeeks: () => void;
  onSelectNoneWeeks: () => void;
};

// Pestañas estilo dashboard Fortnite (Season X): botones de temporada con su
// arte oficial y píldoras de semana tipo EVENT / MISSIONS / STYLE.
export default function WeekTabs(props: WeekTabsSingle | WeekTabsMulti) {
  if (props.multiSelect) {
    return <WeekTabsMultiView {...props} />;
  }
  return <WeekTabsSingleView {...props} />;
}

function WeekTabsMultiView({
  seasons,
  weeks,
  seasonCode,
  onSelectSeason,
  selectedWeeks,
  onToggleWeek,
  onSelectAllWeeks,
  onSelectNoneWeeks,
}: WeekTabsMulti) {
  const selectedSet = new Set(selectedWeeks);
  return (
    <WeekTabsLayout
      seasons={seasons}
      weeks={weeks}
      seasonCode={seasonCode}
      onSelectSeason={onSelectSeason}
      weekSelected={(n) => selectedSet.has(n)}
      onWeekClick={onToggleWeek}
      weekExtras={
        <>
          <button style={pillTab(false)} onClick={onSelectAllWeeks}>
            Todas
          </button>
          <button style={pillTab(false)} onClick={onSelectNoneWeeks}>
            Ninguna
          </button>
        </>
      }
    />
  );
}

function WeekTabsSingleView({
  seasons,
  weeks,
  seasonCode,
  onSelectSeason,
  weekNumber,
  onSelectWeek,
  allSelected = false,
  onSelectAll,
}: WeekTabsSingle) {
  return (
    <WeekTabsLayout
      seasons={seasons}
      weeks={weeks}
      seasonCode={seasonCode}
      onSelectSeason={onSelectSeason}
      weekSelected={(n) => !allSelected && weekNumber === n}
      onWeekClick={onSelectWeek}
      weekExtras={
        onSelectAll ? (
          <button
            style={{
              ...pillTab(allSelected),
              ...(allSelected ? { borderColor: fnt.yellow } : {}),
            }}
            onClick={onSelectAll}
          >
            Todas las semanas
          </button>
        ) : null
      }
    />
  );
}

function WeekTabsLayout({
  seasons,
  weeks,
  seasonCode,
  onSelectSeason,
  weekSelected,
  onWeekClick,
  weekExtras,
}: {
  seasons: Season[];
  weeks: Week[];
  seasonCode: string;
  onSelectSeason: (code: string) => void;
  weekSelected: (weekNumber: number) => boolean;
  onWeekClick: (weekNumber: number) => void;
  weekExtras: ReactNode;
}) {
  const seasonBase: React.CSSProperties = {
    position: "relative",
    width: fs(160, 280),
    height: fs(64, 110),
    borderRadius: 10,
    border: `2px solid ${fnt.border}`,
    backgroundSize: "cover",
    backgroundPosition: "center 25%",
    overflow: "hidden",
    cursor: "pointer",
    display: "flex",
    alignItems: "flex-end",
    padding: 0,
  };

  const seasonName: React.CSSProperties = {
    width: "100%",
    padding: "4px 8px",
    background:
      "linear-gradient(0deg, rgba(3,9,22,0.92) 20%, rgba(3,9,22,0) 100%)",
    color: "white",
    fontFamily: titleFont,
    fontSize: fs(16, 28),
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "left",
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {seasons.map((s) => {
          const locked = !!s.is_locked;
          const selected = s.code === seasonCode;
          return (
            <button
              key={s.id}
              disabled={locked}
              onClick={() => !locked && onSelectSeason(s.code)}
              title={locked ? `${s.display_name} (bloqueada)` : s.display_name}
              style={{
                ...seasonBase,
                backgroundImage: `url(/seasons/${s.code}.png)`,
                border: selected
                  ? `2px solid ${fnt.yellow}`
                  : locked
                    ? "2px solid rgba(8, 26, 58, 0.8)"
                    : `2px solid ${fnt.border}`,
                boxShadow: selected ? "0 0 14px rgba(255,210,60,0.5)" : "none",
                filter: locked ? "grayscale(0.85) brightness(0.6)" : "none",
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              <span style={seasonName}>
                {locked ? "🔒 " : ""}
                {s.display_name}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {weeks.map((w) => (
          <button
            key={w.id}
            style={pillTab(weekSelected(w.week_number))}
            onClick={() => onWeekClick(w.week_number)}
          >
            {w.display_name ?? `Semana ${w.week_number}`}
          </button>
        ))}
        {weekExtras}
      </div>
    </div>
  );
}
