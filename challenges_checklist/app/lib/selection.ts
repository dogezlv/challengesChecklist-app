import type { SupabaseClient } from "@supabase/supabase-js";

export type Season = {
  id: string;
  code: string;
  display_name: string;
  display_name_en?: string | null;
  is_locked?: boolean;
};

export type Week = {
  id: string;
  season_id: string;
  week_number: number;
  display_name: string | null;
};

type SearchParams = { [key: string]: string | string[] | undefined };

// Resuelve temporada y semana seleccionadas a partir de los query params.
// Por defecto: la temporada más reciente y su semana 1.
export async function getSeasonWeekSelection(
  supabase: SupabaseClient,
  params: SearchParams
): Promise<{
  seasons: Season[];
  season: Season | null;
  weeks: Week[];
  week: Week | null;
}> {
  const { data: seasonsData } = await supabase
    .from("seasons")
    .select("*")
    .order("created_at", { ascending: true });

  const seasons: Season[] = seasonsData ?? [];
  const seasonCode =
    typeof params.season === "string" ? params.season : undefined;
  // las temporadas bloqueadas no son seleccionables ni por URL
  const unlocked = seasons.filter((s) => !s.is_locked);
  const season =
    unlocked.find((s) => s.code === seasonCode) ??
    unlocked[unlocked.length - 1] ??
    null;

  let weeks: Week[] = [];
  if (season) {
    const { data: weeksData } = await supabase
      .from("challenge_weeks")
      .select("*")
      .eq("season_id", season.id)
      .order("week_number", { ascending: true });
    weeks = weeksData ?? [];
  }

  const weekNumber = Number(
    typeof params.week === "string" ? params.week : NaN
  );
  const week =
    weeks.find((w) => w.week_number === weekNumber) ?? weeks[0] ?? null;

  return { seasons, season, weeks, week };
}
