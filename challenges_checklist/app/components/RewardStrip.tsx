"use client";

import { fnt, fs, titleFont } from "../lib/theme";

// Tira de recompensas estilo Battle Pass (Season X/8): fila de casillas con
// estrella "10" (y un nodo XP "5k" en el centro) unidas por una línea, con el
// subtítulo "COMPLETA CUALQUIER OBJETIVO…". Decorativa pero ligada al progreso:
// se "ganan" tantas casillas como desafíos completados hay en la semana.
export default function RewardStrip({
  total,
  done,
}: {
  total: number;
  done: number;
}) {
  const count = Math.max(1, Math.min(total || 7, 8));
  const xpIndex = count >= 5 ? Math.floor(count / 2) : -1;
  const tiles = Array.from({ length: count });

  return (
    <div style={{ display: "grid", gap: fs(8, 14) }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: fs(6, 16),
          padding: `0 ${fs(6, 14)}`,
          overflowX: "auto",
        }}
      >
        {/* línea conectora detrás de las casillas */}
        <div
          style={{
            position: "absolute",
            left: fs(28, 52),
            right: fs(28, 52),
            top: fs(23, 41),
            height: 2,
            background: "rgba(150,200,248,0.35)",
            zIndex: 0,
          }}
        />
        {tiles.map((_, i) => {
          const earned = i < done;
          const isXp = i === xpIndex;
          const tileSize = fs(46, 82);
          return (
            <div
              key={i}
              style={{
                position: "relative",
                zIndex: 1,
                display: "grid",
                justifyItems: "center",
                gap: fs(2, 6),
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: tileSize,
                  height: tileSize,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: earned
                    ? "linear-gradient(180deg, #1b5fae 0%, #0c3f86 100%)"
                    : "rgba(6, 30, 68, 0.85)",
                  border: `2px solid ${earned ? fnt.yellow : "rgba(150,200,248,0.3)"}`,
                  boxShadow: earned ? "0 0 10px rgba(255,210,60,0.35)" : "none",
                  filter: earned ? "none" : "grayscale(0.4) brightness(0.8)",
                }}
              >
                {isXp ? (
                  <span
                    style={{
                      fontFamily: titleFont,
                      color: "#bdf36a",
                      fontSize: fs(15, 28),
                    }}
                  >
                    XP
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/icons/battle_star.png"
                    alt=""
                    style={{
                      width: fs(28, 52),
                      height: fs(28, 52),
                      objectFit: "contain",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontFamily: titleFont,
                  fontSize: fs(11, 18),
                  color: earned ? "#ffffff" : "#8fb6e2",
                }}
              >
                {isXp ? "5k" : "10"}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          textAlign: "center",
          fontFamily: titleFont,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "#bcd9f5",
          fontSize: fs(11, 18),
        }}
      >
        Completa cualquier objetivo para ganar la siguiente recompensa
      </div>
    </div>
  );
}
