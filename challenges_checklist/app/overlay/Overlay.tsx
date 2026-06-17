"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Notificación que se encola para mostrarse en el stream (una a la vez).
type Notice = {
  key: string;
  quest: string;
  meta: boolean;
};

// Fila mínima que necesitamos de Realtime / del seed inicial.
type ChallengeRow = {
  id: string;
  is_completed: boolean;
  is_meta: boolean | null;
  description: string;
  week_id: string | null;
};

const ENTER_MS = 700; // duración de la animación de entrada
const EXIT_MS = 550; // duración de la animación de salida

export default function Overlay({
  seasonCode,
  durationMs,
  sound,
  test,
}: {
  seasonCode: string | null;
  durationMs: number;
  sound: boolean;
  test: boolean;
}) {
  const supabase = createClient();
  // estado conocido de cada desafío: detecta la transición a "completado"
  // sin depender de REPLICA IDENTITY FULL (comparamos contra lo último visto).
  const seen = useRef<Map<string, boolean>>(new Map());
  // week_ids de la temporada filtrada; null = no filtrar por temporada.
  const allowedWeeks = useRef<Set<string> | null>(null);

  const [queue, setQueue] = useState<Notice[]>([]);
  const [current, setCurrent] = useState<Notice | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");

  const enqueue = (n: Notice) =>
    setQueue((q) => (q.some((x) => x.key === n.key) ? q : [...q, n]));

  // Sonido sintetizado (sin assets): un "ding" ascendente de dos notas.
  const audioRef = useRef<AudioContext | null>(null);
  function playChime(meta: boolean) {
    if (!sound) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = audioRef.current ?? new Ctx();
      audioRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const notes = meta ? [659.25, 987.77, 1318.51] : [783.99, 1174.66];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const t = now + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } catch {
      // sin audio disponible: no es crítico para la notificación visual
    }
  }

  // Seed: marca como "ya vistos" los desafíos completados al cargar, para no
  // disparar notificaciones de progreso antiguo. Resuelve también el filtro
  // de temporada (week_ids) si se pidió.
  useEffect(() => {
    let cancelled = false;
    async function seed() {
      if (seasonCode) {
        const { data: season } = await supabase
          .from("seasons")
          .select("id")
          .eq("code", seasonCode)
          .maybeSingle();
        if (season) {
          const { data: weeks } = await supabase
            .from("challenge_weeks")
            .select("id")
            .eq("season_id", season.id);
          allowedWeeks.current = new Set((weeks ?? []).map((w) => w.id));
        }
      }
      const { data } = await supabase
        .from("challenges")
        .select("id, is_completed, week_id");
      if (cancelled) return;
      for (const c of data ?? []) seen.current.set(c.id, c.is_completed);
    }
    seed();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonCode]);

  // Suscripción Realtime: cuando un desafío pasa a completado, lo encola.
  useEffect(() => {
    const handle = (row: ChallengeRow | null, isInsert: boolean) => {
      if (!row) return;
      const was = seen.current.get(row.id);
      seen.current.set(row.id, row.is_completed);
      if (!row.is_completed) return;
      // en INSERT solo sembramos estado; las notificaciones son para
      // transiciones reales false -> true durante la sesión.
      if (isInsert || was === true || was === undefined) return;
      const weeks = allowedWeeks.current;
      if (weeks && row.week_id && !weeks.has(row.week_id)) return;
      enqueue({
        key: `${row.id}-${Date.now()}`,
        quest: row.description,
        meta: !!row.is_meta,
      });
    };

    const channel = supabase
      .channel("overlay-challenges")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "challenges" },
        (p) => handle(p.new as ChallengeRow, false)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "challenges" },
        (p) => handle(p.new as ChallengeRow, true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo prueba: una notificación de demostración para posicionar en OBS.
  useEffect(() => {
    if (!test) return;
    enqueue({
      key: "test-demo",
      quest: "Inflige 500 de daño a oponentes con fusiles de asalto",
      meta: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  // Bucle de la cola: muestra una notificación, espera, la oculta y pasa a la
  // siguiente. Los timers se limpian si el componente se desmonta.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    setPhase("in");
    playChime(next.meta);

    const outTimer = setTimeout(() => setPhase("out"), ENTER_MS + durationMs);
    const clearTimer = setTimeout(
      () => setCurrent(null),
      ENTER_MS + durationMs + EXIT_MS
    );
    return () => {
      clearTimeout(outTimer);
      clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, current]);

  return (
    <>
      <style>{styles}</style>
      <div className="ov-root">
        {current && (
          <div
            key={current.key}
            className={`ov-card ${current.meta ? "ov-meta" : ""} ${
              phase === "out" ? "ov-out" : "ov-in"
            }`}
          >
            <div className="ov-badge">
              <span className="ov-badge-icon">{current.meta ? "👑" : "★"}</span>
            </div>
            <div className="ov-text">
              <div className="ov-eyebrow">
                {current.meta ? "¡Semana completada!" : "Desafío completado"}
              </div>
              <div className="ov-quest">{current.quest}</div>
            </div>
            <div className="ov-shine" />
          </div>
        )}
      </div>
    </>
  );
}

// Burbank (la tipografía real de Fortnite) cargada desde public/. El overlay es
// privado para el stream, no distribución pública del recurso.
const styles = `
@font-face {
  font-family: "Burbank";
  src: url("/BurbankBigCondensed-Black.otf") format("opentype");
  font-weight: 900;
  font-display: swap;
}
@font-face {
  font-family: "Burbank";
  src: url("/Burbank%20Big%20Condensed%20Bold.otf") format("opentype");
  font-weight: 700;
  font-display: swap;
}

/* fondo transparente para que OBS solo capture la notificación */
html, body { background: transparent !important; margin: 0; }

.ov-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 48px;
  font-family: "Burbank", "Arial Narrow", sans-serif;
  overflow: hidden;
}

.ov-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 420px;
  max-width: 640px;
  padding: 16px 26px 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1b4f9c 0%, #0e2a5c 55%, #0a1733 100%);
  border: 2px solid #7ccafa;
  box-shadow:
    0 0 0 2px rgba(124, 202, 250, 0.25),
    0 12px 40px rgba(0, 0, 0, 0.55),
    0 0 60px rgba(60, 160, 255, 0.55);
  overflow: hidden;
}

.ov-meta {
  background: linear-gradient(135deg, #a9791a 0%, #5e3f08 55%, #2e2102 100%);
  border-color: #ffd76b;
  box-shadow:
    0 0 0 2px rgba(255, 215, 107, 0.3),
    0 12px 40px rgba(0, 0, 0, 0.55),
    0 0 60px rgba(255, 190, 60, 0.55);
}

.ov-badge {
  flex-shrink: 0;
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  transform: rotate(45deg);
  border-radius: 10px;
  background: linear-gradient(180deg, #aee3ff 0%, #2f8be6 100%);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6), 0 0 18px rgba(120,200,255,0.8);
  animation: ovPulse 1.6s ease-in-out infinite;
}
.ov-meta .ov-badge {
  background: linear-gradient(180deg, #ffe9a8 0%, #e0a014 100%);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.7), 0 0 18px rgba(255,200,80,0.9);
}
.ov-badge-icon {
  transform: rotate(-45deg);
  font-size: 30px;
  line-height: 1;
  color: #0a1733;
  text-shadow: 0 1px 0 rgba(255,255,255,0.5);
}

.ov-text { display: grid; gap: 4px; z-index: 1; }
.ov-eyebrow {
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #aee3ff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}
.ov-meta .ov-eyebrow { color: #ffe9a8; }
.ov-quest {
  font-weight: 700;
  font-size: 27px;
  line-height: 1.05;
  text-transform: uppercase;
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.7);
}

/* barrido de brillo diagonal al aparecer */
.ov-shine {
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  transform: skewX(-20deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
  animation: ovShine 1.1s ease-out 0.45s 1 both;
}

.ov-in { animation: ovIn ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.ov-out { animation: ovOut ${EXIT_MS}ms cubic-bezier(0.7, 0, 0.84, 0) both; }

@keyframes ovIn {
  0%   { transform: translateX(130%) scale(0.96); opacity: 0; }
  70%  { transform: translateX(-2%)  scale(1.02); opacity: 1; }
  100% { transform: translateX(0)    scale(1);    opacity: 1; }
}
@keyframes ovOut {
  0%   { transform: translateX(0)    scale(1);    opacity: 1; }
  100% { transform: translateX(130%) scale(0.96); opacity: 0; }
}
@keyframes ovShine {
  0%   { left: -60%; }
  100% { left: 130%; }
}
@keyframes ovPulse {
  0%, 100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6), 0 0 14px rgba(120,200,255,0.7); }
  50%      { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.8), 0 0 26px rgba(120,200,255,1); }
}
`;
