import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
    .select("*");

  return (
    <main style={{ padding: 40 }}>
      <h1>Challenges</h1>

      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}

      <pre>{JSON.stringify(challenges, null, 2)}</pre>
    </main>
  );
}