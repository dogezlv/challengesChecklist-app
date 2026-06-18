import type { CSSProperties } from "react";

// Fuentes Fortnite (archivos OTF en public/, cargadas en app/layout.tsx):
//  - títulos/encabezados/botones → Burbank Big Condensed Black
//  - cuerpo/descriptivo → Burbank Small Medium
export const titleFont =
  'var(--font-title), "Arial Narrow", Impact, sans-serif';
export const bodyFont =
  'var(--font-body), "Barlow Semi Condensed", Arial, sans-serif';

// Tamaño FLUIDO: escala linealmente con el ancho de viewport entre un móvil
// (~380px → usa `min`) y una pantalla grande/4K (~3000px → usa `max`), con
// tope en ambos extremos. Así el texto no se ve enano en 4K ni gigante en
// móvil. Devuelve un string clamp() válido para `fontSize`, `padding`, etc.
export function fs(min: number, max: number): string {
  const inter = `calc(${min}px + ${(max - min).toFixed(2)} * (100vw - 380px) / 2620)`;
  return `clamp(${min}px, ${inter}, ${max}px)`;
}

// Paleta "Season X / Road Trip": azul brillante saturado, paneles azul marino
// translúcido, barras de progreso finas, acentos en amarillo/oro estilo Battle
// Pass. El respaldo del look anterior (azul oscuro) está en
// docs/aesthetic-backup-darkblue.md.
export const fnt = {
  // fondos
  skyTop: "#3aa9ee",
  blueMid: "#1b7ad4",
  blueDeep: "#0c54a6",
  navy: "#073f86",
  // paneles
  panel: "rgba(6, 32, 74, 0.55)",
  panelSolid: "#0b3d80",
  rowBg: "rgba(4, 24, 58, 0.32)",
  rowActive: "rgba(12, 48, 100, 0.7)",
  border: "rgba(150, 200, 248, 0.32)",
  borderSoft: "rgba(150, 200, 248, 0.18)",
  // barras de progreso
  track: "rgba(2, 14, 36, 0.6)",
  fill: "linear-gradient(90deg, #cdecff 0%, #74c2ff 100%)",
  fillDone: "linear-gradient(90deg, #6ff0ad 0%, #1faa63 100%)",
  fillMeta: "linear-gradient(90deg, #ffe27a 0%, #f5a623 100%)",
  // texto
  text: "#ffffff",
  textDim: "#cfe6ff",
  textMuted: "#8fb6e2",
  // acentos
  yellow: "#ffd23c",
  yellowDeep: "#f5a623",
  green: "#39d98a",
  greenDeep: "#1faa63",
  gold: "#ffcf4d",
  red: "#e1493a",
  warn: "#ffc24b",
} as const;

// Fondo de página: azul brillante con brillo radial arriba, como el lobby.
export const pageBackground =
  "radial-gradient(125% 100% at 50% 0%, #3fb0f0 0%, #1d7dd6 36%, #0c55a8 66%, #063c84 100%)";

// El fondo (degradado + malla animada) lo pinta <PageBackground/> como capa
// fija detrás (z-index:-1), por eso aquí el fondo es transparente.
export const pageMain: CSSProperties = {
  minHeight: "100vh",
  background: "transparent",
  color: fnt.text,
  padding: 0,
};

// Contenedor central: ancho relativo al viewport (más amplio en pantallas
// grandes/4K) con tope, y padding fluido. Junto con la tipografía fluida (fs)
// evita que en 4K se vea todo diminuto y en móvil quepa sin desbordes.
export const contentWrap: CSSProperties = {
  width: "min(1640px, 94vw)",
  margin: "0 auto",
  padding: `${fs(16, 34)} ${fs(12, 32)} 56px`,
};

// Barra de navegación superior tipo "PLAY · BATTLE PASS · CHALLENGES".
export const navBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

export function navTab(active: boolean): CSSProperties {
  return {
    fontFamily: titleFont,
    padding: `${fs(8, 13)} ${fs(14, 26)}`,
    borderRadius: 6,
    fontWeight: 700,
    fontSize: fs(16, 28),
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
    border: "none",
    color: active ? "#0a3e85" : "#dcefff",
    background: active ? "#ffffff" : "rgba(255,255,255,0.12)",
    boxShadow: active ? "0 2px 0 rgba(0,0,0,0.15)" : "none",
    textDecoration: "none",
    display: "inline-block",
    lineHeight: 1,
  };
}

// Panel translúcido azul marino (la "tarjeta" base del lobby).
export const panel: CSSProperties = {
  background: fnt.panel,
  border: `1px solid ${fnt.border}`,
  borderRadius: 10,
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
};

// Banner ancho del Battle Pass (etiqueta pequeña + título grande + % a la derecha).
export const banner: CSSProperties = {
  position: "relative",
  borderRadius: 10,
  padding: `${fs(9, 15)} ${fs(14, 28)}`,
  overflow: "hidden",
  background:
    "linear-gradient(95deg, rgba(8,42,86,0.92) 0%, rgba(16,86,150,0.85) 55%, rgba(20,120,110,0.8) 100%)",
  border: `1px solid ${fnt.border}`,
  boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
};

// Pestaña de semana (píldora estilo EVENT / MISSIONS / STYLE).
export function pillTab(active: boolean): CSSProperties {
  return {
    fontFamily: titleFont,
    padding: `${fs(7, 12)} ${fs(14, 24)}`,
    borderRadius: 999,
    border: active ? "1px solid #bfe6ff" : "1px solid rgba(150,200,248,0.3)",
    background: active
      ? "linear-gradient(180deg, #eaf7ff 0%, #b6e0ff 100%)"
      : "rgba(8, 40, 86, 0.5)",
    color: active ? "#0a3e85" : "#cfe6ff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: fs(15, 26),
    textTransform: "uppercase",
    letterSpacing: 1,
    lineHeight: 1,
  };
}

// Botón amarillo Fortnite (CTA primario, p. ej. "BUY TIERS").
export const yellowButton: CSSProperties = {
  fontFamily: titleFont,
  padding: `${fs(10, 15)} ${fs(18, 30)}`,
  borderRadius: 6,
  border: "none",
  background: `linear-gradient(180deg, ${fnt.yellow} 0%, ${fnt.yellowDeep} 100%)`,
  color: "#3a2600",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: fs(16, 27),
  textTransform: "uppercase",
  letterSpacing: 1,
  lineHeight: 1,
  boxShadow: "0 3px 0 rgba(0,0,0,0.22)",
};

// Botón azul secundario.
export const blueButton: CSSProperties = {
  fontFamily: titleFont,
  padding: `${fs(9, 14)} ${fs(16, 26)}`,
  borderRadius: 6,
  border: "1px solid rgba(150,200,248,0.4)",
  background: "rgba(12, 64, 130, 0.6)",
  color: "#eaf6ff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: fs(15, 25),
  textTransform: "uppercase",
  letterSpacing: 0.8,
  lineHeight: 1,
};

export const progressTrack: CSSProperties = {
  background: fnt.track,
  borderRadius: 999,
  height: 6,
  overflow: "hidden",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
};

export function progressFill(
  percent: number,
  variant: "blue" | "done" | "meta" = "blue"
): CSSProperties {
  return {
    width: `${percent}%`,
    height: "100%",
    background:
      variant === "done" ? fnt.fillDone : variant === "meta" ? fnt.fillMeta : fnt.fill,
    transition: "width 0.35s ease",
  };
}

// ── Color característico por semana (paleta tipo Fortnite) ───────────────────
// Cada semana tiene su acento; tiñe el banner, el chevron, el borde y la barra
// de la tarjeta para que cada semana se sienta única.
export const WEEK_ACCENTS = [
  "#3fa9ff", // 1 azul
  "#b07cff", // 2 violeta
  "#3ed67a", // 3 verde
  "#ff9a3c", // 4 naranja
  "#ff5fa8", // 5 magenta
  "#22d3c4", // 6 turquesa
  "#ff5a4d", // 7 rojo
  "#ffc63d", // 8 ámbar
  "#7c8cff", // 9 índigo
  "#a6e635", // 10 lima
] as const;

export function weekAccent(weekNumber: number): string {
  return WEEK_ACCENTS[(weekNumber - 1) % WEEK_ACCENTS.length] ?? "#3fa9ff";
}

// Acento del modo PRESTIGIO (verde/teal de la Temporada X), pisa el de semana.
export const PRESTIGE_ACCENT = "#14d6a4";

// Banner tintado con un acento (semana o prestigio).
export function accentBanner(accent: string): CSSProperties {
  return {
    position: "relative",
    borderRadius: 10,
    padding: `${fs(9, 15)} ${fs(14, 28)}`,
    overflow: "hidden",
    background: `linear-gradient(100deg, rgba(7,33,72,0.96) 0%, ${accent}b0 60%, ${accent} 116%)`,
    border: `1px solid ${accent}66`,
    boxShadow: `0 6px 20px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.06)`,
  };
}

// Relleno de barra tintado con un acento.
export function accentFill(percent: number, accent: string): CSSProperties {
  return {
    width: `${percent}%`,
    height: "100%",
    borderRadius: 999,
    background: `linear-gradient(90deg, ${accent} 0%, #eafcff 165%)`,
    boxShadow: `0 0 10px ${accent}80`,
    transition: "width 0.35s ease",
  };
}
