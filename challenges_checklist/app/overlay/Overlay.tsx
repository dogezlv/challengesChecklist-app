"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Una notificación visible en el stream. Las completadas se apilan: la más
// reciente queda grande arriba y las anteriores se encogen.
type Notice = {
  key: string;
  quest: string;
  meta: boolean;
  phase: "enter" | "shown" | "leaving";
};

// Fila mínima que necesitamos de Realtime / del seed inicial.
type ChallengeRow = {
  id: string;
  is_completed: boolean;
  is_meta: boolean | null;
  description: string;
  week_id: string | null;
};

const ENTER_MS = 30; // micro-retraso para disparar la transición de entrada
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
  // todos los timers programados, para limpiarlos al desmontar.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [notices, setNotices] = useState<Notice[]>([]);

  const setPhase = (key: string, phase: Notice["phase"]) =>
    setNotices((prev) =>
      prev.map((n) => (n.key === key ? { ...n, phase } : n))
    );

  // Añade una notificación y programa sus tres transiciones (entrar, salir,
  // quitar) de una sola vez, sin depender de re-renders.
  function addNotice(quest: string, meta: boolean) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotices((prev) => [...prev, { key, quest, meta, phase: "enter" }]);
    playSound();
    const t = (ms: number, fn: () => void) => {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
    };
    t(ENTER_MS, () => setPhase(key, "shown"));
    t(ENTER_MS + durationMs, () => setPhase(key, "leaving"));
    t(ENTER_MS + durationMs + EXIT_MS, () =>
      setNotices((prev) => prev.filter((n) => n.key !== key))
    );
  }

  // Reproduce el sonido de desafío completado (assets en public/sounds/).
  // Un Audio nuevo por evento permite que se solapen si caen varios juntos.
  function playSound() {
    if (!sound) return;
    try {
      const a = new Audio("/sounds/challenge-complete.mp3");
      a.volume = 0.9;
      void a.play();
    } catch {
      // sin audio disponible: la notificación visual no es crítica
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
      addNotice(row.description, !!row.is_meta);
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
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo prueba: tres notificaciones escalonadas para ver el apilado y
  // posicionar la fuente en OBS.
  useEffect(() => {
    if (!test) return;
    const demos: [string, boolean][] = [
      ["Inflige 500 de daño a oponentes con fusiles de asalto", false],
      ["Visita los 7 campamentos piratas en una sola partida", false],
      ["Completa todos los desafíos de la semana", true],
    ];
    demos.forEach(([q, m], i) => {
      const id = setTimeout(() => addNotice(q, m), i * 900);
      timers.current.push(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  // La más reciente arriba (depth 0, tamaño completo); las anteriores debajo,
  // cada vez más pequeñas y tenues.
  const stack = [...notices].reverse();

  return (
    <>
      <style>{styles}</style>
      <div className="ov-root">
        {stack.map((n, depth) => {
          const scale = Math.max(1 - depth * 0.12, 0.6);
          const dim = Math.max(1 - depth * 0.14, 0.45);
          const hidden = n.phase !== "shown";
          return (
            <div
              key={n.key}
              className={`ov-card ${n.meta ? "ov-meta" : ""}`}
              style={{
                transform: hidden
                  ? "translateX(130%) scale(1)"
                  : `translateX(0) scale(${scale})`,
                opacity: hidden ? 0 : dim,
                zIndex: 1000 - depth,
              }}
            >
              <div className="ov-badge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={n.meta ? "/icons/battle_pass.png" : "/icons/battle_star.png"}
                  alt=""
                  className="ov-badge-img"
                />
              </div>
              <div className="ov-text">
                <div className="ov-eyebrow">
                  {n.meta ? "¡Semana completada!" : "Desafío completado"}
                </div>
                <div className="ov-quest">{n.quest}</div>
              </div>
              <div className="ov-shine" />
            </div>
          );
        })}
      </div>
    </>
  );
}

// Misma familia tipográfica que la app (Geist con respaldo Arial); el overlay
// NO usa Burbank a propósito.
const styles = `
/* fondo transparente para que OBS solo capture la notificación */
html, body { background: transparent !important; margin: 0; }

.ov-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-end;
  gap: 14px;
  padding: 48px;
  overflow: hidden;
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

.ov-card {
  position: relative;
  transform-origin: top right;
  transition: transform ${EXIT_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
              opacity ${EXIT_MS}ms ease;
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
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 0 10px rgba(120, 200, 255, 0.9));
  animation: ovPulse 1.6s ease-in-out infinite;
}
.ov-meta .ov-badge { filter: drop-shadow(0 0 10px rgba(255, 200, 80, 0.9)); }
.ov-badge-img { width: 100%; height: 100%; object-fit: contain; }

.ov-text { display: grid; gap: 4px; z-index: 1; }
.ov-eyebrow {
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #aee3ff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}
.ov-meta .ov-eyebrow { color: #ffe9a8; }
.ov-quest {
  font-weight: 900;
  font-size: 20px;
  line-height: 1.1;
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
  animation: ovShine 1.1s ease-out 0.4s 1 both;
}

@keyframes ovShine {
  0%   { left: -60%; }
  100% { left: 130%; }
}
@keyframes ovPulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
}
`;
