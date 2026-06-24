"use client";

import FortniteIcon from "./FortniteIcon";
import { accentBanner, banner, bodyFont, fnt, fs, titleFont } from "../lib/theme";

// Banner ancho estilo Battle Pass: etiqueta pequeña + título grande a la
// izquierda y un porcentaje grande (progreso) a la derecha. `accent` tiñe el
// fondo con el color característico de la semana (o del prestigio).
export default function BattlePassBanner({
  label,
  title,
  subtitle,
  percent,
  accent,
  flush = false,
  prestige = false,
  expandControl,
}: {
  label: string;
  title: string;
  subtitle?: string;
  percent?: number;
  accent?: string;
  // pega el banner a la caja de abajo (sin esquinas inferiores redondeadas)
  flush?: boolean;
  // modo prestigio: "imbuye" el banner del color de la semana (más intenso +
  // glow interior), sin volverlo de otro color
  prestige?: boolean;
  /** Flecha de acordeón (tracker): › cerrado, girada abajo abierto */
  expandControl?: { expanded: boolean };
}) {
  const base = accent ? accentBanner(accent) : banner;
  const imbue: React.CSSProperties = prestige
    ? {
        filter: "saturate(1.35) brightness(1.06)",
        boxShadow: `inset 0 0 60px ${accent ?? "#3fa9ff"}66, inset 0 0 0 1px ${accent ?? "#3fa9ff"}80`,
      }
    : {};
  return (
    <div
      style={{
        ...base,
        ...(flush ? { borderRadius: "10px 10px 0 0", border: "none" } : {}),
        ...imbue,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {expandControl && (
            <span
              className="tracker-week-chevron"
              data-expanded={expandControl.expanded ? "true" : "false"}
              aria-hidden
              style={{
                color: "#eafaff",
                fontWeight: 900,
                fontSize: fs(20, 32),
                lineHeight: 1,
                textShadow: "0 2px 6px rgba(0,0,0,0.45)",
                flexShrink: 0,
              }}
            >
              ›
            </span>
          )}
          <FortniteIcon code="battle_star" emoji="⭐" size={30} />
          <div>
            <div
              style={{
                fontFamily: titleFont,
                fontSize: fs(12, 20),
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: fnt.yellow,
              }}
            >
              {label}
            </div>
            <h1
              style={{
                fontFamily: titleFont,
                margin: 0,
                fontSize: fs(24, 46),
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                lineHeight: 0.92,
                color: "#eafaff",
                textShadow: "0 2px 6px rgba(0,0,0,0.45)",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <div
                style={{
                  fontFamily: bodyFont,
                  fontSize: fs(12, 18),
                  color: "#eafaffcc",
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {typeof percent === "number" && (
          <div
            style={{
              fontFamily: titleFont,
              fontSize: fs(24, 48),
              color: "#eafaff",
              textShadow: "0 2px 6px rgba(0,0,0,0.45)",
            }}
          >
            {Math.round(percent)}%
          </div>
        )}
      </div>
    </div>
  );
}
