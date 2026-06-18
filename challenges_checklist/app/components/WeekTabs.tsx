"use client";

import type { Season, Week } from "../lib/selection";
import { fnt, fs, pillTab, titleFont } from "../lib/theme";

// Pestañas estilo dashboard Fortnite (Season X): botones de temporada con su
// arte oficial y píldoras de semana tipo EVENT / MISSIONS / STYLE.
export default function WeekTabs({
  seasons,
  weeks,
  seasonCode,
  weekNumber,
  onSelectSeason,
  onSelectWeek,
  allSelected = false,
  onSelectAll,
}: {
  seasons: Season[];
  weeks: Week[];
  seasonCode: string;
  weekNumber: number;
  onSelectSeason: (code: string) => void;
  onSelectWeek: (weekNumber: number) => void;
  allSelected?: boolean;
  onSelectAll?: () => void;
}) {
  // botones de temporada estilo "nav de temporadas" del juego: la imagen
  // oficial de fondo y un candado en las temporadas bloqueadas
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {weeks.map((w) => (
          <button
            key={w.id}
            style={pillTab(!allSelected && w.week_number === weekNumber)}
            onClick={() => onSelectWeek(w.week_number)}
          >
            {w.display_name ?? `Semana ${w.week_number}`}
          </button>
        ))}
        {onSelectAll && (
          <button
            style={{
              ...pillTab(allSelected),
              ...(allSelected ? { borderColor: fnt.yellow } : {}),
            }}
            onClick={onSelectAll}
          >
            Todas las semanas
          </button>
        )}
      </div>
    </div>
  );
}
