import { fetchProgressOnly } from "@/app/lib/trackerSync";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSeasonWeekSelection } from "../lib/selection";
import { CHALLENGE_SELECT } from "../lib/types";
import TrackerPanel from "./TrackerPanel";

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const liteParam = params.lite;
  const initialLite =
    liteParam === "1" ||
    liteParam === "true" ||
    (Array.isArray(liteParam) && (liteParam[0] === "1" || liteParam[0] === "true"));

  const { seasons, season, weeks, week } = await getSeasonWeekSelection(
    supabase,
    params
  );

  const weekIds = weeks.map((w) => w.id);

  const { data: activeMatch } = await supabase
    .from("matches")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  const activeMatchId = activeMatch?.id ?? null;

  const [
    challenges,
    lines,
    actionTypes,
    locations,
    progressBundle,
    effects,
    objectTags,
    adminRow,
  ] = await Promise.all([
    weekIds.length
      ? supabase
          .from("challenges")
          .select(CHALLENGE_SELECT)
          .in("week_id", weekIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from("challenge_lines").select("*"),
    supabase.from("action_types").select("*").order("display_name"),
    supabase.from("locations").select("*").order("display_name"),
    fetchProgressOnly(supabase, activeMatchId),
    supabase
      .from("object_effects")
      .select(
        "trigger_action, effect_action, amount_per_use, object:game_objects (id, code, display_name)"
      ),
    supabase.from("game_object_tags").select("object_id, tag_id"),
    supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <TrackerPanel
      seasons={seasons}
      weeks={weeks}
      seasonCode={season?.code ?? ""}
      initialWeekNumber={week?.week_number ?? 1}
      initialChallenges={challenges.data ?? []}
      lines={lines.data ?? []}
      actionTypes={actionTypes.data ?? []}
      locations={locations.data ?? []}
      initialActiveMatch={activeMatch ?? null}
      initialRuleProgress={progressBundle.ruleProgress}
      initialDistinctProgress={progressBundle.distinctProgress}
      effects={(effects.data ?? []) as never[]}
      objectTagPairs={objectTags.data ?? []}
      isAdmin={!!adminRow.data}
      userId={user.id}
      actorName={
        user.email ? user.email.split("@")[0] ?? "supervisor" : "supervisor"
      }
      initialLite={initialLite}
    />
  );
}
