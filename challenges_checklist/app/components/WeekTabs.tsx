"use client";

import type { Season, Week } from "../lib/selection";

// Pestañas estilo dashboard Fortnite (Season 8) para temporada y semana.
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
  const base: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #1c74e3",
    background: "#0b1d3a",
    color: "#9fc9f5",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  const active: React.CSSProperties = {
    ...base,
    background: "linear-gradient(180deg, #7ccafa 0%, #1c74e3 100%)",
    color: "white",
    border: "1px solid #7ccafa",
    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
  };

  // botones de temporada estilo "nav de temporadas" del juego: la imagen
  // oficial de fondo y un candado en las temporadas bloqueadas
  const seasonBase: React.CSSProperties = {
    position: "relative",
    width: 190,
    height: 72,
    borderRadius: 10,
    border: "2px solid #1c74e3",
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
    padding: "3px 8px",
    background: "linear-gradient(0deg, rgba(3,9,22,0.92) 20%, rgba(3,9,22,0) 100%)",
    color: "white",
    fontWeight: 800,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "left",
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
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
                  ? "2px solid #ffd76b"
                  : locked
                    ? "2px solid #2c4a7c"
                    : "2px solid #1c74e3",
                boxShadow: selected ? "0 0 12px rgba(255,215,107,0.45)" : "none",
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
            style={!allSelected && w.week_number === weekNumber ? active : base}
            onClick={() => onSelectWeek(w.week_number)}
          >
            {w.display_name ?? `Semana ${w.week_number}`}
          </button>
        ))}
        {onSelectAll && (
          <button
            style={allSelected ? { ...active, border: "1px solid #ffd76b" } : base}
            onClick={onSelectAll}
          >
            Todas las semanas
          </button>
        )}
      </div>
    </div>
  );
}
