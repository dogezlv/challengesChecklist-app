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
  const { seasons, season, weeks, week } = await getSeasonWeekSelection(
    supabase,
    params
  );

  const weekIds = weeks.map((w) => w.id);

  const [
    challenges,
    lines,
    actionTypes,
    locations,
    activeMatch,
    ruleProgress,
    distinctProgress,
    effects,
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
    supabase.from("matches").select("*").eq("is_active", true).maybeSingle(),
    supabase
      .from("match_rule_progress")
      .select("challenge_rule_id, match_id"),
    supabase
      .from("challenge_distinct_progress")
      .select("challenge_id, location_id, match_id"),
    supabase
      .from("object_effects")
      .select(
        "trigger_action, effect_action, amount_per_use, object:game_objects (id, code, display_name)"
      ),
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
      initialActiveMatch={activeMatch.data ?? null}
      initialRuleProgress={ruleProgress.data ?? []}
      initialDistinctProgress={distinctProgress.data ?? []}
      effects={(effects.data ?? []) as never[]}
      isAdmin={!!adminRow.data}
      userId={user.id}
      actorName={
        user.email ? user.email.split("@")[0] ?? "supervisor" : "supervisor"
      }
    />
  );
}
