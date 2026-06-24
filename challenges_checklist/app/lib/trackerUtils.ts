import type { Challenge } from "./types";

/** Misc del panel global: excluye ganar partida (salvo máquinas expendedoras). */
export function isPanelMiscChallenge(c: Challenge): boolean {
  const miscRules = (c.challenge_rules ?? []).filter(
    (r) => r.action_type?.code === "misc"
  );
  if (miscRules.length !== 1) return false;
  const keys = new Set(
    miscRules[0].rule_conditions.map((rc) => rc.condition_key)
  );
  return !(keys.has("win_match") && !keys.has("only_vending_weapons"));
}

/** En acción "search" el contenedor va en target_object, no en required_object. */
export function normalizeSearchObjectFields<
  T extends {
    usedKey: string | null;
    usedOption: unknown;
    targetKey: string | null;
    targetOption: unknown;
  },
>(actionCode: string, fields: T): T {
  if (actionCode !== "search") return fields;
  if (!fields.targetOption && fields.usedOption) {
    return {
      ...fields,
      targetKey: fields.usedKey,
      targetOption: fields.usedOption,
      usedKey: null,
      usedOption: null,
    };
  }
  return fields;
}
