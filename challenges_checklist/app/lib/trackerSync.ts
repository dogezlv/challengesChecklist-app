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

function normalizeChallengeScalars(row: Partial<Challenge>): Partial<Challenge> {
  const out = { ...row };
  if (out.current_value != null) out.current_value = Number(out.current_value);
  if (out.target_value != null) out.target_value = Number(out.target_value);
  return out;
}

/**
 * Aplica un evento Realtime de `challenges` (misma base que la checklist pública).
 * En tracker, `preserveRules` mantiene `challenge_rules` del fetch inicial.
 */
export function applyChallengesRealtimeEvent(
  prev: Challenge[],
  eventType: "INSERT" | "UPDATE" | "DELETE",
  oldRow: Partial<Challenge> | undefined,
  newRow: (Partial<Challenge> & { id?: string }) | undefined,
  weekIdSet: Set<string>,
  options?: { preserveRules?: boolean }
): Challenge[] {
  if (eventType === "DELETE") {
    const id = oldRow?.id;
    return id ? prev.filter((c) => c.id !== id) : prev;
  }

  const row = newRow;
  if (!row?.id) return prev;
  if (row.week_id && !weekIdSet.has(row.week_id)) return prev;

  const idx = prev.findIndex((c) => c.id === row.id);
  const normalized = normalizeChallengeScalars(row);

  if (idx === -1) {
    return eventType === "INSERT" ? [...prev, normalized as Challenge] : prev;
  }

  const existing = prev[idx];
  const next = prev.slice();

  if (options?.preserveRules) {
    next[idx] = {
      ...existing,
      ...normalized,
      challenge_rules: existing.challenge_rules,
    } as Challenge;
  } else {
    next[idx] = { ...existing, ...normalized } as Challenge;
  }

  return next;
}

/** Parche escalar preservando `challenge_rules` anidados. */
export function patchChallengeRow(
  prev: Challenge[],
  eventType: "INSERT" | "UPDATE" | "DELETE",
  row: Partial<Challenge> & { id: string },
  weekIdSet: Set<string>
): Challenge[] {
  return applyChallengesRealtimeEvent(
    prev,
    eventType,
    eventType === "DELETE" ? row : undefined,
    row,
    weekIdSet,
    { preserveRules: true }
  );
}

export function patchChallengesFromReport(
  prev: Challenge[],
  updated: ReportPatch[]
): Challenge[] {
  if (!updated?.length) return prev;
  const byId = new Map(updated.map((u) => [u.id, u]));
  return prev.map((c) => {
    const patch = byId.get(c.id);
    if (!patch) return c;
    return {
      ...c,
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.current_value !== undefined && {
        current_value: Number(patch.current_value),
      }),
      ...(patch.target_value !== undefined && {
        target_value: Number(patch.target_value),
      }),
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

/** Progreso de reglas/ubicaciones distintas para desafíos de las semanas cargadas. */
export async function fetchProgressOnly(
  supabase: SupabaseClient,
  weekIds: string[]
): Promise<{ ruleProgress: RuleProgressRow[]; distinctProgress: DistinctRow[] }> {
  if (!weekIds.length) {
    return { ruleProgress: [], distinctProgress: [] };
  }

  const { data: challengeRows, error: chErr } = await supabase
    .from("challenges")
    .select("id")
    .in("week_id", weekIds);
  if (chErr) throw new Error(chErr.message);

  const challengeIds = (challengeRows ?? []).map((r) => r.id);
  if (!challengeIds.length) {
    return { ruleProgress: [], distinctProgress: [] };
  }

  const [ruleRes, distinctRes] = await Promise.all([
    supabase
      .from("match_rule_progress")
      .select("challenge_rule_id, match_id")
      .in("challenge_id", challengeIds),
    supabase
      .from("challenge_distinct_progress")
      .select("challenge_id, location_id, match_id")
      .in("challenge_id", challengeIds),
  ]);

  if (ruleRes.error) throw new Error(ruleRes.error.message);
  if (distinctRes.error) throw new Error(distinctRes.error.message);

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
