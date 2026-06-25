import type { SupabaseClient } from "@supabase/supabase-js";

export type TrackerLogActionContext = {
  actionName?: string;
  amount?: number;
  used?: string | null;
  target?: string | null;
  location?: string | null;
  conditions?: string[];
};

export type TrackerLogPayload = {
  action?: TrackerLogActionContext;
  updated?: {
    id: string;
    description: string;
    current_value: number;
    target_value: number;
    is_completed: boolean;
  }[];
  skipped?: { id: string; description: string; reason?: string }[];
  error?: string;
  message?: string;
};

export type TrackerLogRow = {
  id: string;
  user_id: string;
  actor_name: string;
  section: string;
  action_code: string | null;
  payload: TrackerLogPayload;
  created_at: string;
};

export function globalSection(actionCode: string): string {
  return `global:${actionCode}`;
}

export const MATCH_SECTION = "match";
export const WEEK_SECTION = "week";

export function actorNameFromEmail(email: string | undefined): string {
  if (!email) return "supervisor";
  const name = email.split("@")[0]?.trim();
  return name || "supervisor";
}

export function formatActionSummary(payload: TrackerLogPayload): string | null {
  const a = payload.action;
  if (!a) return null;

  const parts: string[] = [];
  if (a.actionName) {
    parts.push(a.amount != null ? `${a.actionName}: ${a.amount}` : a.actionName);
  } else if (a.amount != null) {
    parts.push(String(a.amount));
  }
  if (a.used) parts.push(`Usado: ${a.used}`);
  if (a.target) parts.push(`Objetivo: ${a.target}`);
  if (a.location) parts.push(`Lugar: ${a.location}`);
  if (a.conditions?.length) {
    parts.push(`Condiciones: ${a.conditions.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Una entrada por usuario dentro de cada sección (la más reciente gana). */
export function upsertSectionLogRow(
  prev: Record<string, TrackerLogRow[]>,
  row: TrackerLogRow
): Record<string, TrackerLogRow[]> {
  const key = row.section;
  const rest = (prev[key] ?? []).filter((e) => e.user_id !== row.user_id);
  return { ...prev, [key]: [row, ...rest] };
}

/** Agrupa filas recientes (orden desc) en mapa sección → última acción por supervisor. */
export function groupRecentLogsBySection(
  rows: TrackerLogRow[]
): Record<string, TrackerLogRow[]> {
  const bySection = new Map<string, Map<string, TrackerLogRow>>();
  for (const row of rows) {
    let users = bySection.get(row.section);
    if (!users) {
      users = new Map();
      bySection.set(row.section, users);
    }
    if (!users.has(row.user_id)) {
      users.set(row.user_id, row);
    }
  }
  const out: Record<string, TrackerLogRow[]> = {};
  for (const [section, users] of bySection) {
    out[section] = [...users.values()].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  return out;
}

export async function logTrackerActivity(
  supabase: SupabaseClient,
  section: string,
  actionCode: string | null,
  payload: TrackerLogPayload
): Promise<void> {
  const { error } = await supabase.rpc("log_tracker_activity", {
    p_section: section,
    p_action_code: actionCode,
    p_payload: payload,
  });
  if (error) console.warn("log_tracker_activity:", error.message);
}

export function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function sectionLabel(section: string, actionTypes: Map<string, string>): string {
  if (section === MATCH_SECTION) return "Partida";
  if (section === WEEK_SECTION) return "Vista semanal";
  if (section.startsWith("global:")) {
    const code = section.slice(7);
    return actionTypes.get(code) ?? code;
  }
  return section;
}
