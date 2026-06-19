import type { Challenge } from "@/app/lib/types";

export type MissionVisual = {
  kind: "loading_screen" | "treasure_map";
  src: string;
  title: string;
  /** Etiqueta corta del botón junto a la misión */
  buttonLabel: string;
};

const LOADING_SCREEN_ICON = "/icons/treasure_map_magnify.png";
const TREASURE_MAP_ICON = "/icons/treasure_signpost.png";

export const MISSION_VISUALS: Record<string, MissionVisual> = {
  lupa_loading: {
    kind: "loading_screen",
    src: "/treasure/loading_magnify.jpg",
    title: "Pantalla de carga — Mapa del tesoro (lupa)",
    buttonLabel: "Pantalla de carga",
  },
  cuchillo_loading: {
    kind: "loading_screen",
    src: "/treasure/loading_knife.jpg",
    title: "Pantalla de carga — Mapa del tesoro (cuchillo)",
    buttonLabel: "Pantalla de carga",
  },
  map_paradise: {
    kind: "treasure_map",
    src: "/treasure/map_1_arctic_airport.png",
    title: "Mapa del tesoro 1 — Aeródromo Ártico",
    buttonLabel: "Mapa del tesoro",
  },
  map_junk: {
    kind: "treasure_map",
    src: "/treasure/map_junk_junction.png",
    title: "Mapa del tesoro — Cruce Chatarra (Fork Knife)",
    buttonLabel: "Mapa del tesoro",
  },
};

function ruleLocationCode(c: Challenge): string | null {
  const r = c.challenge_rules?.[0];
  return r?.location?.code ?? null;
}

/** Visual de referencia (pantalla de carga o mapa) para una misión concreta. */
export function getMissionVisual(c: Challenge): MissionVisual | null {
  const desc = c.description.toLowerCase();
  const loc = ruleLocationCode(c);

  if (desc.includes("lupa") && desc.includes("pantalla de carga")) {
    return { ...MISSION_VISUALS.lupa_loading, buttonLabel: "Pantalla de carga" };
  }
  if (desc.includes("cuchillo") && desc.includes("pantalla de carga")) {
    return { ...MISSION_VISUALS.cuchillo_loading, buttonLabel: "Pantalla de carga" };
  }
  if (
    loc === "treasure_map_1_arctic_airport" ||
    (desc.includes("palmeras paradisíacas") && desc.includes("mapa del tesoro"))
  ) {
    return { ...MISSION_VISUALS.map_paradise, buttonLabel: "Mapa del tesoro" };
  }
  if (
    loc === "treasure_map_2_forknife" ||
    (desc.includes("cruce chatarra") && desc.includes("mapa del tesoro"))
  ) {
    return { ...MISSION_VISUALS.map_junk, buttonLabel: "Mapa del tesoro" };
  }
  return null;
}

export function visualButtonIcon(visual: MissionVisual): string {
  return visual.kind === "loading_screen" ? LOADING_SCREEN_ICON : TREASURE_MAP_ICON;
}
