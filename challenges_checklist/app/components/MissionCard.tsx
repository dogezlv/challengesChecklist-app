"use client";

import FortniteIcon from "./FortniteIcon";
import { accentFill, bodyFont, fnt, fs, progressFill, progressTrack, titleFont } from "../lib/theme";

// Fila de desafío estilo "Road Trip" (Battle Pass, Season X): chevron a la
// izquierda, objetivo en texto claro, barra de progreso fina y contador X/Y a
// la derecha. Completado = check verde, meta = oro, bloqueado = atenuado.
export default function MissionCard({
  title,
  quest,
  current,
  target,
  completed,
  locked = false,
  meta = false,
  accent: accentProp,
  children,
}: {
  title: string;
  quest: string;
  current: number;
  target: number;
  completed: boolean;
  locked?: boolean;
  meta?: boolean;
  // color característico (de la semana o del prestigio); tiñe borde/chevron/barra
  accent?: string;
  children?: React.ReactNode;
}) {
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const variant = completed ? "done" : meta ? "meta" : "blue";
  const accent = completed ? fnt.green : meta ? fnt.gold : accentProp ?? "#bfe6ff";
  const fillStyle =
    !completed && !meta && accentProp
      ? accentFill(percent, accentProp)
      : progressFill(percent, variant);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${fs(34, 52)} 1fr`,
        gap: fs(10, 18),
        alignItems: "center",
        padding: `${fs(12, 20)} ${fs(14, 26)}`,
        borderRadius: 8,
        background: completed
          ? "rgba(12, 70, 48, 0.32)"
          : meta
            ? "rgba(86, 64, 10, 0.34)"
            : fnt.rowBg,
        border: `1px solid ${fnt.borderSoft}`,
        borderLeftWidth: 3,
        borderLeftColor: locked ? "rgba(150,200,248,0.25)" : accent,
        opacity: locked ? 0.6 : 1,
      }}
    >
      {/* chevron / estado */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: fs(34, 52),
          height: fs(34, 52),
        }}
      >
        {completed ? (
          <span style={{ fontSize: fs(20, 32), color: fnt.green }}>✓</span>
        ) : locked ? (
          <span style={{ fontSize: fs(17, 26) }}>🔒</span>
        ) : meta ? (
          <FortniteIcon code="battle_star" emoji="⭐" size={28} />
        ) : (
          <span
            style={{ fontSize: fs(22, 36), fontWeight: 900, color: accent }}
          >
            ›
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: fs(6, 11), minWidth: 0 }}>
        <div
          style={{
            fontFamily: titleFont,
            fontWeight: 700,
            fontSize: fs(12, 20),
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: meta ? fnt.gold : fnt.textMuted,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: bodyFont,
            fontWeight: 500,
            fontSize: fs(16, 28),
            lineHeight: 1.22,
          }}
        >
          {quest}
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: fs(12, 20) }}
        >
          <div style={{ ...progressTrack, height: fs(6, 10), flex: 1 }}>
            <div style={fillStyle} />
          </div>
          <div
            style={{
              fontFamily: titleFont,
              fontSize: fs(16, 28),
              color: completed ? fnt.green : meta ? fnt.gold : fnt.textDim,
              whiteSpace: "nowrap",
              minWidth: fs(56, 90),
              textAlign: "right",
            }}
          >
            {current} / {target}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
