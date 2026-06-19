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
