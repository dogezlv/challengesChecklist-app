import Overlay from "./Overlay";

// Overlay para OBS (Browser Source). Página pública sin sesión: escucha
// Realtime y muestra una notificación estilo Fortnite al completar un desafío.
//
// Parámetros (?clave=valor):
//   season=<code>   solo notificar desafíos de esa temporada (por defecto: todas)
//   duration=<ms>   tiempo visible de la notificación (por defecto 6000)
//   test=1          muestra una notificación de demostración al cargar
export default async function OverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const str = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;

  const seasonCode = str("season") ?? null;
  const durationMs = Math.max(1000, Number(str("duration")) || 6000);
  const test = str("test") === "1";

  return <Overlay seasonCode={seasonCode} durationMs={durationMs} test={test} />;
}
