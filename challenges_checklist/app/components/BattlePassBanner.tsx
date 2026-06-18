"use client";

import FortniteIcon from "./FortniteIcon";
import { banner, bodyFont, fnt, fs, titleFont } from "../lib/theme";

// Banner ancho estilo Battle Pass: etiqueta pequeña + título grande a la
// izquierda y un porcentaje grande (progreso) a la derecha.
export default function BattlePassBanner({
  label,
  title,
  subtitle,
  percent,
}: {
  label: string;
  title: string;
  subtitle?: string;
  percent?: number;
}) {
  return (
    <div style={banner}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FortniteIcon code="battle_star" emoji="⭐" size={40} />
          <div>
            <div
              style={{
                fontFamily: titleFont,
                fontSize: fs(15, 28),
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
                fontSize: fs(40, 88),
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                lineHeight: 0.9,
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
                  fontSize: fs(13, 21),
                  color: fnt.textDim,
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
              fontSize: fs(38, 84),
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
