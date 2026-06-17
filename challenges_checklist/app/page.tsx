import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import ChallengeChecklist from "./components/ChallengeChecklist";
import LogoutButton from "./components/LogoutButton";
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

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #050d1f 0%, #0a1a38 60%, #102448 100%)",
        backgroundAttachment: "fixed",
        padding: 28,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            color: "white",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 900,
            fontSize: 26,
          }}
        >
          Desafíos semanales
        </h1>
        <nav style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {user ? (
            <>
              <Link href="/tracker" style={{ color: "#7ccafa", fontWeight: 700 }}>
                Panel de supervisión
              </Link>
              {adminRow.data && (
                <Link href="/admin" style={{ color: "#7ccafa", fontWeight: 700 }}>
                  Admin
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "linear-gradient(180deg, #7ccafa 0%, #1c74e3 100%)",
                color: "white",
                fontWeight: 800,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Iniciar sesión
            </Link>
          )}
        </nav>
      </header>

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
    </main>
  );
}
