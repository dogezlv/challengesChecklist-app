"use client";

import {
  bodyFont,
  fnt,
  fs,
  panel,
  panelClassName,
  progressFill,
  progressTrack,
  titleFont,
} from "../lib/theme";

/** Barra de progreso global de la temporada (desafíos no-meta). */
export default function SeasonProgressBar({
  done,
  total,
  seasonLabel,
}: {
  done: number;
  total: number;
  seasonLabel?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;
  const barPct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const fillVariant = done >= total && total > 0 ? "done" : "blue";

  return (
    <div
      className={panelClassName}
      style={{
        ...panel,
        padding: `${fs(12, 16)} ${fs(14, 20)}`,
        display: "grid",
        gap: fs(8, 10),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: titleFont,
              fontSize: fs(13, 18),
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: fnt.yellow,
            }}
          >
            {seasonLabel
              ? `Progreso · ${seasonLabel}`
              : "Progreso de la temporada"}
          </div>
          <div
            style={{
              fontFamily: bodyFont,
              fontSize: fs(13, 16),
              color: fnt.textDim,
              marginTop: 2,
            }}
          >
            {done} de {total} desafíos completados
          </div>
        </div>
        <div
          style={{
            fontFamily: titleFont,
            fontSize: fs(22, 36),
            fontWeight: 700,
            color: "#eafaff",
            textShadow: "0 2px 6px rgba(0,0,0,0.35)",
            lineHeight: 1,
          }}
        >
          {pct % 1 === 0 ? Math.round(pct) : pct}%
        </div>
      </div>
      <div style={{ ...progressTrack, height: fs(8, 12) }}>
        <div style={progressFill(barPct, fillVariant)} />
      </div>
    </div>
  );
}
