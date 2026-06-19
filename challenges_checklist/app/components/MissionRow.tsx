"use client";

import FortniteIcon from "./FortniteIcon";
import { accentFill, bodyFont, fnt, fs, progressTrack, titleFont } from "../lib/theme";

// Fila de desafío estilo Battle Pass de Fortnite (Road Trip): chevron a la
// izquierda, objetivo + barra de progreso fina debajo, contador X/Y a la
// derecha. Plana y a todo el ancho, separada por una línea sutil — pensada
// para ir DENTRO del recuadro continuo (sin tarjetas redondeadas).
export default function MissionRow({
  quest,
  current,
  target,
  completed,
  locked = false,
  meta = false,
  accent = "#bfe6ff",
  lockedLabel,
  first = false,
  children,
}: {
  quest: string;
  current: number;
  target: number;
  completed: boolean;
  locked?: boolean;
  meta?: boolean;
  accent?: string;
  lockedLabel?: string;
  first?: boolean;
  // controles opcionales (los usa el tracker): se renderizan a todo el ancho
  // debajo de la fila
  children?: React.ReactNode;
}) {
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const color = completed ? fnt.green : meta ? fnt.gold : accent;

  return (
    <div
      style={{
        padding: `${fs(11, 18)} ${fs(8, 16)}`,
        borderTop: first ? "none" : `1px solid ${fnt.borderSoft}`,
        background: completed
          ? "rgba(12, 70, 48, 0.20)"
          : meta
            ? "rgba(86, 64, 10, 0.22)"
            : "transparent",
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${fs(26, 40)} 1fr auto`,
          gap: fs(10, 18),
          alignItems: "center",
        }}
      >
      {/* chevron / candado / check */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        {completed ? (
          <span style={{ color: fnt.green, fontSize: fs(18, 28) }}>✓</span>
        ) : locked ? (
          <span style={{ fontSize: fs(14, 22) }}>🔒</span>
        ) : meta ? (
          <FortniteIcon code="battle_star" emoji="⭐" size={22} />
        ) : (
          <span style={{ color, fontWeight: 900, fontSize: fs(20, 32), lineHeight: 1 }}>
            ›
          </span>
        )}
      </div>

      {/* objetivo + barra */}
      <div style={{ display: "grid", gap: fs(7, 11), minWidth: 0 }}>
        <div
          style={{
            fontFamily: bodyFont,
            fontWeight: 600,
            fontSize: fs(15, 24),
            lineHeight: 1.18,
            color: locked ? fnt.textMuted : "#eaf6ff",
          }}
        >
          {locked ? lockedLabel ?? quest : quest}
        </div>
        {!locked && (
          <div style={{ ...progressTrack, height: fs(5, 8) }}>
            <div
              style={
                completed
                  ? { width: "100%", height: "100%", borderRadius: 999, background: fnt.fillDone }
                  : accentFill(percent, color)
              }
            />
          </div>
        )}
      </div>

      {/* contador */}
      {!locked && (
        <div
          style={{
            fontFamily: titleFont,
            fontSize: fs(15, 25),
            color: completed ? fnt.green : meta ? fnt.gold : fnt.textDim,
            whiteSpace: "nowrap",
            paddingLeft: fs(6, 12),
          }}
        >
          {current} / {target}
        </div>
      )}
      </div>

      {/* controles (tracker), a todo el ancho debajo */}
      {!locked && children && (
        <div style={{ marginTop: fs(8, 13) }}>{children}</div>
      )}
    </div>
  );
}
