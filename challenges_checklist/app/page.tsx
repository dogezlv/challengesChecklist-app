import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import ChallengeChecklist from "./components/ChallengeChecklist";
import LogoutButton from "./components/LogoutButton";
import PageBackground from "./components/PageBackground";
import TopNav from "./components/TopNav";
import { contentWrap, navTab, pageMain } from "./lib/theme";
import { getSeasonWeekSelection } from "./lib/selection";

// Página pública: cualquiera puede ver las misiones (solo lectura, con
// Realtime). Los controles de progreso viven en /tracker (requiere sesión).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const { seasons, season, weeks, week } = await getSeasonWeekSelection(
    supabase,
    params
  );

  const weekIds = weeks.map((w) => w.id);

  const [challengesRes, linesRes, adminRow] = await Promise.all([
    weekIds.length
      ? supabase
          .from("challenges")
          .select("*")
          .in("week_id", weekIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("challenge_lines").select("*"),
    user
      ? supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const navTabs = [
    { label: "Misiones", href: "/", active: true },
    ...(user ? [{ label: "Panel", href: "/tracker" }] : []),
    ...(user && adminRow.data ? [{ label: "Admin", href: "/admin" }] : []),
  ];

  return (
    <main style={pageMain}>
      <PageBackground />
      <div style={contentWrap}>
        <TopNav
          tabs={navTabs}
          right={
            user ? (
              <LogoutButton />
            ) : (
              <Link href="/login" style={navTab(false)}>
                Iniciar sesión
              </Link>
            )
          }
        />

        {"error" in challengesRes && challengesRes.error && (
          <pre style={{ color: "#fca5a5" }}>
            {JSON.stringify(challengesRes.error, null, 2)}
          </pre>
        )}

        <ChallengeChecklist
          initialChallenges={challengesRes.data || []}
          lines={linesRes.data || []}
          seasons={seasons}
          weeks={weeks}
          seasonCode={season?.code ?? ""}
          initialWeekNumber={week?.week_number ?? 1}
        />
      </div>
    </main>
  );
}
