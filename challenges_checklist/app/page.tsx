import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ChallengeChecklist from "./components/ChallengeChecklist";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: challenges, error } = await supabase
    .from("challenges")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <main style={{ padding: 40 }}>
      <h1>Challenges</h1>

      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}

      <ChallengeChecklist initialChallenges={challenges || []} />
    </main>
  );
}