import type { SupabaseClient } from "@supabase/supabase-js";
import { CHALLENGE_SELECT, type Challenge } from "./types";

export type RuleProgressRow = {
  challenge_rule_id: string;
  match_id: string | null;
};

export type DistinctRow = {
  challenge_id: string;
  location_id: string;
  match_id: string | null;
};

export type ReportPatch = {
  id: string;
  description?: string;
  current_value?: number | null;
  target_value?: number | null;
  is_completed?: boolean;
};

/** Debounce genérico para colapsar ráfagas Realtime. */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as T & { cancel: () => void };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

const SCALAR_CHALLENGE_KEYS = [
  "description",
  "is_completed",
  "current_value",
  "target_value",
  "completed_in_match",
  "kind",
  "unit",
  "match_scope",
  "rules_operator",
  "line_id",
  "phase_order",
  "week_id",
  "is_meta",
  "is_prestige",
  "created_at",
] as const;

/** Parche escalar preservando `challenge_rules` anidados. */
export function patchChallengeRow(
  prev: Challenge[],
  eventType: "INSERT" | "UPDATE" | "DELETE",
  row: Partial<Challenge> & { id: string },
  weekIdSet: Set<string>
): Challenge[] {
  if (eventType === "DELETE") {
    return prev.filter((c) => c.id !== row.id);
  }
  if (row.week_id && !weekIdSet.has(row.week_id)) return prev;

  const idx = prev.findIndex((c) => c.id === row.id);
  if (idx === -1) {
    return eventType === "INSERT" ? [...prev, row as Challenge] : prev;
  }

  const existing = prev[idx];
  const merged = { ...existing } as Challenge;
  for (const key of SCALAR_CHALLENGE_KEYS) {
    if (key in row && row[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = row[key];
    }
  }
  const next = prev.slice();
  next[idx] = merged;
  return next;
}

export function patchChallengesFromReport(
  prev: Challenge[],
  updated: ReportPatch[]
): Challenge[] {
  if (!updated.length) return prev;
  const byId = new Map(updated.map((u) => [u.id, u]));
  return prev.map((c) => {
    const patch = byId.get(c.id);
    if (!patch) return c;
    return {
      ...c,
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.current_value !== undefined && {
        current_value: patch.current_value,
      }),
      ...(patch.target_value !== undefined && { target_value: patch.target_value }),
      ...(patch.is_completed !== undefined && { is_completed: patch.is_completed }),
    };
  });
}

export function buildRuleProgressIndex(
  rows: RuleProgressRow[]
): Map<string, RuleProgressRow[]> {
  const map = new Map<string, RuleProgressRow[]>();
  for (const row of rows) {
    const list = map.get(row.challenge_rule_id) ?? [];
    list.push(row);
    map.set(row.challenge_rule_id, list);
  }
  return map;
}

export function buildDistinctProgressIndex(
  rows: DistinctRow[]
): Map<string, DistinctRow[]> {
  const map = new Map<string, DistinctRow[]>();
  for (const row of rows) {
    const list = map.get(row.challenge_id) ?? [];
    list.push(row);
    map.set(row.challenge_id, list);
  }
  return map;
}

export function ruleProgressHit(
  index: Map<string, RuleProgressRow[]>,
  ruleId: string,
  predicate: (row: RuleProgressRow) => boolean
): boolean {
  const rows = index.get(ruleId);
  if (!rows?.length) return false;
  return rows.some(predicate);
}

/** Progreso acotado: acumuladores globales + partida activa. */
export async function fetchProgressOnly(
  supabase: SupabaseClient,
  activeMatchId: string | null
): Promise<{ ruleProgress: RuleProgressRow[]; distinctProgress: DistinctRow[] }> {
  let ruleQuery = supabase
    .from("match_rule_progress")
    .select("challenge_rule_id, match_id");
  if (activeMatchId) {
    ruleQuery = ruleQuery.or(`match_id.is.null,match_id.eq.${activeMatchId}`);
  } else {
    ruleQuery = ruleQuery.is("match_id", null);
  }

  let distinctQuery = supabase
    .from("challenge_distinct_progress")
    .select("challenge_id, location_id, match_id");
  if (activeMatchId) {
    distinctQuery = distinctQuery.or(
      `match_id.is.null,match_id.eq.${activeMatchId}`
    );
  } else {
    distinctQuery = distinctQuery.is("match_id", null);
  }

  const [ruleRes, distinctRes] = await Promise.all([ruleQuery, distinctQuery]);
  return {
    ruleProgress: (ruleRes.data ?? []) as RuleProgressRow[],
    distinctProgress: (distinctRes.data ?? []) as DistinctRow[],
  };
}

export async function fetchFullChallenges(
  supabase: SupabaseClient,
  weekIds: string[]
): Promise<Challenge[]> {
  if (!weekIds.length) return [];
  const { data, error } = await supabase
    .from("challenges")
    .select(CHALLENGE_SELECT)
    .in("week_id", weekIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Challenge[];
}

export function patchRuleProgressRow(
  prev: RuleProgressRow[],
  eventType: string,
  row: RuleProgressRow & { id?: string }
): RuleProgressRow[] {
  const key = (r: RuleProgressRow) =>
    `${r.challenge_rule_id}:${r.match_id ?? "null"}`;
  const rowKey = key(row);

  if (eventType === "DELETE") {
    return prev.filter((r) => key(r) !== rowKey);
  }

  const idx = prev.findIndex((r) => key(r) === rowKey);
  if (idx === -1) return [...prev, row];
  const next = prev.slice();
  next[idx] = row;
  return next;
}

export function patchDistinctRow(
  prev: DistinctRow[],
  eventType: string,
  row: DistinctRow
): DistinctRow[] {
  const key = (r: DistinctRow) =>
    `${r.challenge_id}:${r.location_id}:${r.match_id ?? "null"}`;
  const rowKey = key(row);

  if (eventType === "DELETE") {
    return prev.filter((r) => key(r) !== rowKey);
  }

  if (prev.some((r) => key(r) === rowKey)) return prev;
  return [...prev, row];
}
