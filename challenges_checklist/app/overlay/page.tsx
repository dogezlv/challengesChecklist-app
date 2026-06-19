import Overlay from "./Overlay";

// Overlay para OBS (Browser Source). Página pública sin sesión: escucha
// Realtime y muestra una notificación estilo Fortnite al completar un desafío.
//
// Parámetros (?clave=valor):
//   season=<code>   solo notificar desafíos de esa temporada (por defecto: todas)
//   duration=<ms>   tiempo visible de la notificación (por defecto 4500)
//   test=1          demo con textos reales (solo pruebas privadas)
//   test=2          demo con textos genéricos, apto para mostrar en público
//   challenge=<uuid> con test=2: en vivo; al completar ESE desafío encola
//                   los 5 estilos públicos (como test=2 sin params).
export default async function OverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const str = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;

  const seasonCode = str("season") ?? null;
  const durationMs = Math.max(1000, Number(str("duration")) || 2000);
  const testRaw = str("test");
  const testMode =
    testRaw === "1" ? 1 : testRaw === "2" ? 2 : 0;
  const watchChallengeId = str("challenge") ?? null;

  return (
    <Overlay
      seasonCode={seasonCode}
      durationMs={durationMs}
      testMode={testMode}
      watchChallengeId={watchChallengeId}
    />
  );
}
