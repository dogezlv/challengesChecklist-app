"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Una notificación de la cola. `id` = id del desafío (para fusionar eventos
// del mismo desafío que aún no se han mostrado). `to` = valor al que anima la
// barra; `target` = valor objetivo.
type Notice = {
  id: string;
  key: string;
  type: "progress" | "completed" | "meta";
  quest: string;
  week: string | null;
  to: number;
  target: number;
};

type ChallengeRow = {
  id: string;
  is_completed: boolean;
  is_meta: boolean | null;
  description: string;
  week_id: string | null;
  current_value: number | null;
  target_value: number | null;
};

const ENTER_MS = 450; // entrada (deslizar)
const FILL_MS = 850; // relleno de la barra + conteo del número
const EXIT_MS = 450; // salida (deslizar)

export default function Overlay({
  seasonCode,
  durationMs,
  test,
}: {
  seasonCode: string | null;
  durationMs: number;
  test: boolean;
}) {
  const supabase = createClient();

  // baseline conocido de cada desafío: {valor, completado}. Detecta progreso
  // nuevo y la transición a completado sin REPLICA IDENTITY FULL.
  const state = useRef<Map<string, { value: number; completed: boolean }>>(
    new Map()
  );
  // último valor YA MOSTRADO de cada desafío: la barra anima desde aquí.
  const shown = useRef<Map<string, number>>(new Map());
  // week_id -> número de semana, para etiquetar la notificación.
  const weeks = useRef<Map<string, number>>(new Map());
  const allowedWeeks = useRef<Set<string> | null>(null);

  const queue = useRef<Notice[]>([]); // en espera (FIFO)
  const currentRef = useRef<Notice | null>(null); // mostrándose ahora
  const fromRef = useRef(0); // valor inicial de la animación actual
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [current, setCurrent] = useState<Notice | null>(null);
  const [phase, setPhase] = useState<"enter" | "show" | "leaving">("enter");
  const [anim, setAnim] = useState(0); // valor animado (número + barra)

  // Saca el siguiente de la cola y arranca su ciclo de vida. No hace nada si
  // ya hay una notificación en pantalla (se respeta el turno).
  function pump() {
    if (currentRef.current) return;
    const next = queue.current.shift();
    if (!next) return;

    currentRef.current = next;
    fromRef.current = shown.current.get(next.id) ?? 0;
    setAnim(fromRef.current);
    setCurrent(next);
    setPhase("enter");

    const t = (ms: number, fn: () => void) => {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
    };
    t(ENTER_MS, () => setPhase("show")); // dispara el relleno
    t(ENTER_MS + FILL_MS + durationMs, () => setPhase("leaving"));
    t(ENTER_MS + FILL_MS + durationMs + EXIT_MS, () => {
      shown.current.set(next.id, next.to); // queda como base para la próxima
      currentRef.current = null;
      setCurrent(null);
      pump(); // siguiente de la cola
    });
  }

  // Encola un evento. Si ya hay uno EN ESPERA del mismo desafío, lo reemplaza
  // por el más avanzado (progreso mayor o completado). El que se está
  // mostrando no se toca: el nuevo evento espera su turno.
  function enqueue(n: Notice) {
    const q = queue.current;
    const idx = q.findIndex((x) => x.id === n.id);
    if (idx >= 0) {
      n.key = q[idx].key; // conserva su posición/identidad
      q[idx] = n;
    } else {
      q.push(n);
    }
    pump();
  }

  // Convierte una fila de la BD en notificación si representa un cambio nuevo.
  function handle(row: ChallengeRow, isInsert: boolean) {
    const prev = state.current.get(row.id);
    const val = row.current_value ?? 0;
    const target = row.target_value ?? 1;
    const done = !!row.is_completed;
    state.current.set(row.id, { value: val, completed: done });

    if (isInsert || !prev) return; // INSERT / sin baseline: solo registrar
    const allowed = allowedWeeks.current;
    if (allowed && row.week_id && !allowed.has(row.week_id)) return;

    const weekNum = row.week_id ? weeks.current.get(row.week_id) : undefined;
    const mk = (type: Notice["type"], to: number): Notice => ({
      id: row.id,
      key: `${row.id}-${Date.now()}`,
      type,
      quest: row.description,
      week: weekNum != null ? `Semana ${weekNum}` : null,
      to,
      target,
    });

    if (done && !prev.completed) {
      enqueue(mk(row.is_meta ? "meta" : "completed", target));
    } else if (!done && val > prev.value) {
      enqueue(mk("progress", val));
    }
  }

  // Seed: baseline de todos los desafíos al cargar (no notifica progreso
  // viejo) y resuelve el filtro de temporada.
  useEffect(() => {
    let cancelled = false;
    async function seed() {
      let allowedSeasonId: string | null = null;
      if (seasonCode) {
        const { data: season } = await supabase
          .from("seasons")
          .select("id")
          .eq("code", seasonCode)
          .maybeSingle();
        allowedSeasonId = season?.id ?? null;
      }
      const { data: weeksData } = await supabase
        .from("challenge_weeks")
        .select("id, week_number, season_id");
      const allowed = new Set<string>();
      for (const w of weeksData ?? []) {
        weeks.current.set(w.id, w.week_number);
        if (allowedSeasonId && w.season_id === allowedSeasonId) allowed.add(w.id);
      }
      if (allowedSeasonId) allowedWeeks.current = allowed;

      const { data } = await supabase
        .from("challenges")
        .select("id, is_completed, current_value");
      if (cancelled) return;
      for (const c of data ?? []) {
        state.current.set(c.id, {
          value: c.current_value ?? 0,
          completed: c.is_completed,
        });
        shown.current.set(c.id, c.current_value ?? 0);
      }
    }
    seed();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonCode]);

  // Suscripción Realtime.
  useEffect(() => {
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

  // Modo prueba: progreso → completado → semanal, para ver los tres tipos.
  useEffect(() => {
    if (!test) return;
    enqueue({
      id: "demo-progress",
      key: "demo-progress",
      type: "progress",
      quest: "Inflige daño a oponentes con fusiles de asalto",
      week: "Semana 3",
      to: 40,
      target: 100,
    });
    enqueue({
      id: "demo-completed",
      key: "demo-completed",
      type: "completed",
      quest: "Visita los 7 campamentos piratas en una sola partida",
      week: "Semana 3",
      to: 7,
      target: 7,
    });
    enqueue({
      id: "demo-meta",
      key: "demo-meta",
      type: "meta",
      quest: "Completa todos los desafíos de la semana",
      week: "Semana 3",
      to: 7,
      target: 7,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  // Animación de la barra y el número (de `from` a `to`) al entrar en "show".
  useEffect(() => {
    if (!current || phase !== "show") return;
    const from = fromRef.current;
    const to = current.to;
    if (to === from) {
      setAnim(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / FILL_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setAnim(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current?.key, phase]);

  if (!current) return <style>{styles}</style>;

  const eyebrow =
    current.type === "meta"
      ? "¡Semana completada!"
      : current.type === "completed"
        ? "Desafío completado"
        : "Progreso de misión";
  const icon = current.type === "meta" ? "/icons/battle_pass.png" : "/icons/battle_star.png";
  const pct =
    current.target > 0 ? Math.min((anim / current.target) * 100, 100) : 0;

  return (
    <>
      <style>{styles}</style>
      <div className="ov-root">
        <div className={`ov-card ov-${current.type} ov-${phase}`}>
          <div className="ov-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon} alt="" className="ov-badge-img" />
          </div>
          <div className="ov-text">
            <div className="ov-eyebrow">
              {current.week ? `${current.week} · ` : ""}
              {eyebrow}
            </div>
            <div className="ov-quest">{current.quest}</div>
            <div className="ov-bar">
              <div className="ov-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div
            className="ov-count"
            style={{ minWidth: `${String(current.target).length * 2 + 3}ch` }}
          >
            {Math.round(anim)} / {current.target}
          </div>
          <div className="ov-shine" />
        </div>
      </div>
    </>
  );
}

// Misma familia tipográfica que la app (Geist con respaldo Arial).
const styles = `
html, body { background: transparent !important; margin: 0; }

.ov-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 48px;
  overflow: hidden;
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

.ov-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 460px;
  max-width: 680px;
  padding: 16px 24px 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1b4f9c 0%, #0e2a5c 55%, #0a1733 100%);
  border: 2px solid #7ccafa;
  box-shadow:
    0 0 0 2px rgba(124, 202, 250, 0.25),
    0 12px 40px rgba(0, 0, 0, 0.55),
    0 0 60px rgba(60, 160, 255, 0.5);
  overflow: hidden;
}
.ov-completed {
  background: linear-gradient(135deg, #157a3e 0%, #0d3d22 55%, #07210f 100%);
  border-color: #7ef5a8;
  box-shadow: 0 0 0 2px rgba(126,245,168,0.3), 0 12px 40px rgba(0,0,0,0.55), 0 0 60px rgba(60,220,120,0.5);
}
.ov-meta {
  background: linear-gradient(135deg, #a9791a 0%, #5e3f08 55%, #2e2102 100%);
  border-color: #ffd76b;
  box-shadow: 0 0 0 2px rgba(255,215,107,0.3), 0 12px 40px rgba(0,0,0,0.55), 0 0 60px rgba(255,190,60,0.5);
}

.ov-badge {
  flex-shrink: 0;
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 0 10px rgba(120, 200, 255, 0.9));
  animation: ovPulse 1.6s ease-in-out infinite;
}
.ov-completed .ov-badge { filter: drop-shadow(0 0 10px rgba(126,245,168,0.9)); }
.ov-meta .ov-badge { filter: drop-shadow(0 0 10px rgba(255,200,80,0.9)); }
.ov-badge-img { width: 100%; height: 100%; object-fit: contain; }

.ov-text { flex: 1; min-width: 0; display: grid; gap: 6px; z-index: 1; }
.ov-eyebrow {
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #aee3ff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}
.ov-completed .ov-eyebrow { color: #b9ffd0; }
.ov-meta .ov-eyebrow { color: #ffe9a8; }
.ov-quest {
  font-weight: 900;
  font-size: 19px;
  line-height: 1.1;
  text-transform: uppercase;
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.7);
}

.ov-bar {
  margin-top: 2px;
  height: 10px;
  border-radius: 6px;
  background: rgba(0,0,0,0.35);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
  overflow: hidden;
}
.ov-bar-fill {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, #7ccafa, #1c74e3);
  box-shadow: 0 0 10px rgba(124,202,250,0.8);
}
.ov-completed .ov-bar-fill { background: linear-gradient(90deg, #7ef5a8, #16a34a); box-shadow: 0 0 10px rgba(126,245,168,0.8); }
.ov-meta .ov-bar-fill { background: linear-gradient(90deg, #ffe9a8, #e0a014); box-shadow: 0 0 10px rgba(255,200,80,0.8); }

.ov-count {
  flex-shrink: 0;
  align-self: flex-end;
  font-weight: 900;
  font-size: 17px;
  color: #cfe6ff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.7);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ov-completed .ov-count { color: #b9ffd0; }
.ov-meta .ov-count { color: #ffe9a8; }

.ov-shine {
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  transform: skewX(-20deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: ovShine 1.1s ease-out 0.4s 1 both;
}

.ov-enter { animation: ovIn ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.ov-show { transform: translateX(0); opacity: 1; }
.ov-leaving { animation: ovOut ${EXIT_MS}ms cubic-bezier(0.7, 0, 0.84, 0) both; }

@keyframes ovIn {
  0%   { transform: translateX(130%) scale(0.96); opacity: 0; }
  70%  { transform: translateX(-2%)  scale(1.02); opacity: 1; }
  100% { transform: translateX(0)    scale(1);    opacity: 1; }
}
@keyframes ovOut {
  0%   { transform: translateX(0)    scale(1);    opacity: 1; }
  100% { transform: translateX(130%) scale(0.96); opacity: 0; }
}
@keyframes ovShine { 0% { left: -60%; } 100% { left: 130%; } }
@keyframes ovPulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
}
`;
