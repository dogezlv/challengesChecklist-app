import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BettingPanel from "./BettingPanel";

export default async function AdminBettingPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) redirect("/");

  const { data: seasons } = await supabase
    .from("seasons")
    .select("id, code, display_name")
    .eq("is_locked", false)
    .order("created_at", { ascending: false });

  const seasonList = seasons ?? [];
  const weeksBySeason: Record<string, { id: string; week_number: number }[]> = {};

  for (const s of seasonList) {
    const { data: weeks } = await supabase
      .from("challenge_weeks")
      .select("id, week_number")
      .eq("season_id", s.id)
      .order("week_number");
    weeksBySeason[s.id] = weeks ?? [];
  }

  return <BettingPanel seasons={seasonList} weeksBySeason={weeksBySeason} />;
}
