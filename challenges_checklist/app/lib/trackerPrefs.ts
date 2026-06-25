"use client";

const STORAGE_KEY = "tracker-view-prefs";

type SeasonPrefs = { weeks?: number[]; prestige?: boolean };
type Stored = Record<string, SeasonPrefs>;

function readAll(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Stored;
  } catch {
    return {};
  }
}

function writeAll(data: Stored) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function readTrackerViewPrefs(
  seasonCode: string,
  validWeekNumbers: number[]
): { selectedWeeks: Set<number>; prestigeView: boolean } {
  if (!seasonCode) {
    return { selectedWeeks: new Set(), prestigeView: false };
  }
  const entry = readAll()[seasonCode];
  const valid = new Set(validWeekNumbers);
  const weeks = (entry?.weeks ?? []).filter((n) => valid.has(n));
  return {
    selectedWeeks: new Set(weeks),
    prestigeView: !!entry?.prestige,
  };
}

export function writeTrackerViewPrefs(
  seasonCode: string,
  patch: { weeks?: number[]; prestige?: boolean }
) {
  if (!seasonCode) return;
  const all = readAll();
  const prev = all[seasonCode] ?? {};
  all[seasonCode] = {
    ...prev,
    ...(patch.weeks !== undefined ? { weeks: patch.weeks } : {}),
    ...(patch.prestige !== undefined ? { prestige: patch.prestige } : {}),
  };
  writeAll(all);
}
