import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
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

  const [
    actionTypes,
    tags,
    gameObjects,
    locations,
    challenges,
    challengeLines,
  ] = await Promise.all([
    supabase.from("action_types").select("*").order("display_name"),
    supabase.from("tags").select("*").order("display_name"),
    supabase.from("game_objects").select("*").order("display_name"),
    supabase.from("locations").select("*").order("display_name"),
    supabase.from("challenges").select("*").order("created_at"),
    supabase.from("challenge_lines").select("*").order("created_at"),
  ]);

  return (
    <AdminPanel
      actionTypes={actionTypes.data ?? []}
      tags={tags.data ?? []}
      gameObjects={gameObjects.data ?? []}
      locations={locations.data ?? []}
      challenges={challenges.data ?? []}
      challengeLines={challengeLines.data ?? []}
    />
  );
}