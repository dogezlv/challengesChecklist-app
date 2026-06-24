"use client";

import { fnt, fs } from "../lib/theme";
import { useLiteMode } from "../lib/liteMode";

/** Botón cuadrado en la barra superior: activa modo ligero (menos animaciones/blur). */
export default function LiteModeToggle() {
  const { lite, toggleLite } = useLiteMode();

  return (
    <button
      type="button"
      onClick={toggleLite}
      aria-pressed={lite}
      aria-label={
        lite
          ? "Modo ligero activo. Pulsa para restaurar animaciones."
          : "Activar modo ligero (menos animaciones y efectos)"
      }
      title={
        lite
          ? "Modo ligero: ON — menos animaciones"
          : "Modo ligero: OFF — pulsa para ahorrar recursos"
      }
      style={{
        width: fs(38, 44),
        height: fs(38, 44),
        padding: 0,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: `2px solid ${lite ? fnt.yellow : fnt.border}`,
        background: lite
          ? "linear-gradient(180deg, rgba(255,215,0,0.22) 0%, rgba(180,140,0,0.18) 100%)"
          : "rgba(4, 24, 58, 0.55)",
        color: lite ? fnt.yellow : "#eafaff",
        cursor: "pointer",
        boxShadow: lite ? `0 0 12px ${fnt.yellow}44` : "0 2px 0 rgba(0,0,0,0.18)",
        lineHeight: 1,
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        style={{ display: "block" }}
      >
        <path
          d="M13 2L4.5 13.2c-.5.65-.08 1.8.75 1.8H11v6.5c0 .85 1.08 1.25 1.65.65L20 13.5c.55-.6.15-1.5-.65-1.5H13V2z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
