import type { Challenge } from "./types";

export type SpecialLandKind = "high_point_win" | "named_after_vents";

/** Prestigios con flujo de aterrizaje especial (S6 elevaciones, S9 respiraderos). */
export function specialLandKind(c: Challenge): SpecialLandKind | null {
  const d = c.description.toLowerCase();
  if (d.includes("elevaciones") && d.includes("autobús")) {
    return "high_point_win";
  }
  if (d.includes("respiraderos volcánicos")) {
    return "named_after_vents";
  }
  return null;
}
