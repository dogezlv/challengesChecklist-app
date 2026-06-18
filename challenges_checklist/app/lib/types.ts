export type Named = {
  id: string;
  code: string;
  display_name: string;
  is_weapon?: boolean;
};

export type LocationRow = Named & { named_location: boolean };

export type RuleCondition = {
  id: string;
  condition_key: string;
  condition_value: string;
  requires_weapon?: boolean;
};

export type Rule = {
  id: string;
  action_type: Named | null;
  required_object: Named | null;
  required_tag: Named | null;
  target_object: Named | null;
  target_tag: Named | null;
  location: Named | null;
  rule_conditions: RuleCondition[];
};

export type Challenge = {
  id: string;
  description: string;
  is_completed: boolean;
  created_at: string;
  kind: "simple" | "progress";
  unit: "count" | "value" | "distinct_location";
  match_scope: "any_match" | "same_match" | "different_matches";
  rules_operator: "and" | "or" | null;
  current_value: number | null;
  target_value: number | null;
  line_id: string | null;
  phase_order: number | null;
  week_id: string | null;
  is_meta: boolean;
  // partida (aún activa) en la que se completó: bloquea la siguiente fase
  // de la línea hasta que esa partida termine
  completed_in_match?: string | null;
  challenge_rules?: Rule[];
};

export type LineRow = { id: string; name: string | null };

export type Match = { id: string; started_at: string };

export const SCOPE_LABEL: Record<string, string> = {
  any_match: "Cualquier partida",
  same_match: "Misma partida",
  different_matches: "Partidas diferentes",
};

export const ACTION_EMOJI: Record<string, string> = {
  damage: "💥",
  kill: "☠️",
  search: "📦",
  use: "🛠️",
  visit: "📍",
  land: "🪂",
  gain: "❤️",
  dance: "💃",
  destroy: "🪓",
  harvest: "⛏️",
  outlast: "⏳",
  revive: "🚑",
  misc: "🎲",
};

// Solo la fase incompleta más baja de cada línea está activa, y además queda
// bloqueada si la fase anterior se completó en la partida AÚN activa
// (completed_in_match se limpia al terminar la partida).
export function computeLockedIds(challenges: Challenge[]): Set<string> {
  const byLine = new Map<string, Challenge[]>();
  for (const c of challenges) {
    if (!c.line_id) continue;
    const list = byLine.get(c.line_id) ?? [];
    list.push(c);
    byLine.set(c.line_id, list);
  }
  const locked = new Set<string>();
  byLine.forEach((list) => {
    const sorted = [...list].sort(
      (a, b) => (a.phase_order ?? 0) - (b.phase_order ?? 0)
    );
    const pending = sorted.filter((c) => !c.is_completed);
    for (let i = 1; i < pending.length; i++) locked.add(pending[i].id);
    if (pending.length > 0) {
      const first = pending[0];
      const prev = sorted
        .filter((c) => c.is_completed && (c.phase_order ?? 0) < (first.phase_order ?? 0))
        .pop();
      if (prev?.completed_in_match) locked.add(first.id);
    }
  });
  return locked;
}

// Orden estable para mostrar: cada línea de fases es un grupo que se mantiene
// JUNTO (fase 1,2,3 seguidas, ascendentes) en el lugar de su fase más antigua;
// completar un desafío no lo mueve de sitio.
export function sortWeekChallenges(list: Challenge[]): Challenge[] {
  const anchor = new Map<string, string>();
  for (const c of list) {
    if (!c.line_id) continue;
    const cur = anchor.get(c.line_id);
    if (!cur || c.created_at < cur) anchor.set(c.line_id, c.created_at);
  }
  // clave de grupo: (ancla, id de línea) para que las fases de una línea
  // nunca se intercalen con otras aunque compartan created_at
  const groupKey = (c: Challenge) =>
    c.line_id
      ? `${anchor.get(c.line_id)}|${c.line_id}`
      : `${c.created_at}|${c.id}`;
  return [...list].sort((a, b) => {
    const ka = groupKey(a);
    const kb = groupKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (a.phase_order ?? 0) - (b.phase_order ?? 0);
  });
}

// búsqueda insensible a mayúsculas y tildes
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const CHALLENGE_SELECT = `
  *,
  challenge_rules (
    id,
    action_type:action_types (id, code, display_name),
    required_object:game_objects!challenge_rules_required_object_id_fkey (id, code, display_name, is_weapon),
    required_tag:tags!challenge_rules_required_tag_id_fkey (id, code, display_name, is_weapon),
    target_object:game_objects!challenge_rules_target_object_id_fkey (id, code, display_name),
    target_tag:tags!challenge_rules_target_tag_id_fkey (id, code, display_name),
    location:locations!challenge_rules_location_id_fkey (id, code, display_name),
    rule_conditions (id, condition_key, condition_value, requires_weapon)
  )
`;
