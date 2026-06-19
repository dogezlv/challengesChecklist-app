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
  from: number;
  to: number;
  target: number;
  prestige: boolean;
  eyebrow?: string;
  prestigeTag?: string;
};

type ChallengeRow = {
  id: string;
  is_completed: boolean;
  is_meta: boolean | null;
  is_prestige: boolean | null;
  description: string;
  week_id: string | null;
  current_value: number | null;
  target_value: number | null;
};

const ENTER_MS = 450; // entrada (deslizar)
const FILL_MS = 850; // relleno de la barra + conteo del número
const EXIT_MS = 450; // salida (deslizar)

// test=2 / overlay público: sin número de semana real (evita spoilers).
const PUBLIC_WEEK_PLACEHOLDER = "···";

const DEMO_NOTICES: Record<1 | 2, Notice[]> = {
  1: [
    {
      id: "demo-progress",
      key: "demo-progress",
      type: "progress",
      quest: "Inflige daño a oponentes con fusiles de asalto",
      week: "Semana 3",
      from: 10,
      to: 40,
      target: 100,
      prestige: false,
    },
    {
      id: "demo-completed",
      key: "demo-completed",
      type: "completed",
      quest: "Visita los 7 campamentos piratas en una sola partida",
      week: "Semana 3",
      from: 6,
      to: 7,
      target: 7,
      prestige: false,
    },
    {
      id: "demo-meta",
      key: "demo-meta",
      type: "meta",
      quest: "Completa todos los desafíos de la semana",
      week: "Semana 3",
      from: 6,
      to: 7,
      target: 7,
      prestige: false,
    },
    {
      id: "demo-prestige-progress",
      key: "demo-prestige-progress",
      type: "progress",
      quest: "Visita 2 puntos cardinales opuestos en la misma partida",
      week: "Semana 2",
      from: 0,
      to: 1,
      target: 2,
      prestige: true,
    },
    {
      id: "demo-prestige",
      key: "demo-prestige",
      type: "completed",
      quest: "Gana salud o escudo con un bidón de plasma",
      week: "Semana 2",
      from: 90,
      to: 180,
      target: 180,
      prestige: true,
    },
  ],
  2: [
    {
      id: "demo-progress",
      key: "demo-progress",
      type: "progress",
      quest: "Vista previa — barra de progreso animada",
      eyebrow: "Progreso actualizado",
      week: PUBLIC_WEEK_PLACEHOLDER,
      from: 12,
      to: 48,
      target: 100,
      prestige: false,
    },
    {
      id: "demo-completed",
      key: "demo-completed",
      type: "completed",
      quest: "Vista previa — notificación en verde",
      eyebrow: "¡Completado!",
      week: PUBLIC_WEEK_PLACEHOLDER,
      from: 4,
      to: 5,
      target: 5,
      prestige: false,
    },
    {
      id: "demo-meta",
      key: "demo-meta",
      type: "meta",
      quest: "Vista previa — acento dorado",
      eyebrow: "¡Completado!",
      week: PUBLIC_WEEK_PLACEHOLDER,
      from: 9,
      to: 10,
      target: 10,
      prestige: false,
    },
    {
      id: "demo-prestige-progress",
      key: "demo-prestige-progress",
      type: "progress",
      quest: "Vista previa — efecto iridiscente activo",
      eyebrow: "Estilo premium",
      week: PUBLIC_WEEK_PLACEHOLDER,
      from: 1,
      to: 2,
      target: 4,
      prestige: true,
      prestigeTag: "Premium",
    },
    {
      id: "demo-prestige",
      key: "demo-prestige",
      type: "completed",
      quest: "Vista previa — efecto iridiscente finalizado",
      eyebrow: "¡Estilo premium listo!",
      week: PUBLIC_WEEK_PLACEHOLDER,
      from: 60,
      to: 120,
      target: 120,
      prestige: true,
      prestigeTag: "Premium",
    },
  ],
};

// Plantillas públicas (mismo copy que test=2) para stream sin spoilers.
function publicNotice(
  rowId: string,
  from: number,
  to: number,
  target: number,
  isPrestige: boolean,
  isMeta: boolean
): Notice {
  const key = `${rowId}-${Date.now()}`;
  const week = PUBLIC_WEEK_PLACEHOLDER;
  if (isMeta) {
    return {
      id: rowId,
      key,
      type: "meta",
      quest: "Vista previa — acento dorado",
      eyebrow: "¡Completado!",
      week,
      from,
      to,
      target,
      prestige: false,
    };
  }
  if (isPrestige) {
    return {
      id: rowId,
      key,
      type: "completed",
      quest: "Vista previa — efecto iridiscente finalizado",
      eyebrow: "¡Estilo premium listo!",
      week,
      from,
      to,
      target,
      prestige: true,
      prestigeTag: "Premium",
    };
  }
  return {
    id: rowId,
    key,
    type: "completed",
    quest: "Vista previa — notificación en verde",
    eyebrow: "¡Completado!",
    week,
    from,
    to,
    target,
    prestige: false,
  };
}

export default function Overlay({
  seasonCode,
  durationMs,
  testMode,
  watchChallengeId,
}: {
  seasonCode: string | null;
  durationMs: number;
  testMode: 0 | 1 | 2;
  watchChallengeId: string | null;
}) {
  const supabase = createClient();
  // test=2 + challenge = overlay público en vivo (sin demo al cargar).
  const publicLive = testMode === 2 && !!watchChallengeId;
  const watchId = useRef(watchChallengeId);
  watchId.current = watchChallengeId;

  // baseline conocido de cada desafío: {valor, completado}. Detecta progreso
  // nuevo y la transición a completado sin REPLICA IDENTITY FULL.
  const state = useRef<Map<string, { value: number; completed: boolean }>>(
    new Map()
  );
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
    fromRef.current = next.from;
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
      // Conserva el ARRANQUE de la notificación que ya esperaba: la barra debe
      // animar desde lo último que se mostró (el `from` original), no desde el
      // penúltimo evento — si no, un evento nuevo mientras espera haría que se
      // viera solo el último saltito (+1) en vez de todo el progreso.
      n.from = Math.min(q[idx].from, n.from);
      if (n.from > n.to) n.from = n.to; // nunca animar hacia atrás
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

    const watched = watchId.current;
    if (watched && row.id !== watched) return;

    const allowed = allowedWeeks.current;
    if (allowed && row.week_id && !allowed.has(row.week_id)) return;

    const weekNum = row.week_id ? weeks.current.get(row.week_id) : undefined;
    const weekLabel = weekNum != null ? `Semana ${weekNum}` : null;

    if (publicLive) {
      if (done && !prev.completed) {
        enqueue(
          publicNotice(
            row.id,
            prev.value,
            target,
            target,
            !!row.is_prestige,
            !!row.is_meta
          )
        );
      }
      return;
    }

    const mk = (type: Notice["type"], from: number, to: number): Notice => ({
      id: row.id,
      key: `${row.id}-${Date.now()}`,
      type,
      quest: row.description,
      week: weekLabel,
      from,
      to,
      target,
      prestige: !!row.is_prestige,
    });

    if (done && !prev.completed) {
      enqueue(mk(row.is_meta ? "meta" : "completed", prev.value, target));
    } else if (!done && val > prev.value) {
      enqueue(mk("progress", prev.value, val));
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
    const activeTimers = timers.current;
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
      activeTimers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo prueba local: recorre estilos al cargar (solo sin ?challenge=).
  useEffect(() => {
    if (!testMode || watchChallengeId) return;
    for (const notice of DEMO_NOTICES[testMode]) enqueue(notice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode, watchChallengeId]);

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
  }, [current, phase]);

  if (!current) return <style>{styles}</style>;

  const eyebrow =
    current.eyebrow ??
    (current.prestige
      ? current.type === "completed"
        ? "¡Prestigio completado!"
        : "Desafío de prestigio"
      : current.type === "meta"
        ? "¡Semana completada!"
        : current.type === "completed"
          ? "Desafío completado"
          : "Progreso de misión");
  const icon = current.type === "meta" ? "/icons/battle_pass.png" : "/icons/battle_star.png";
  const pct =
    current.target > 0 ? Math.min((anim / current.target) * 100, 100) : 0;

  return (
    <>
      <style>{styles}</style>
      <div className="ov-root">
        <div
          key={current.key}
          className={`ov-card ov-${current.type} ov-${phase}${
            current.prestige ? " ov-prestige" : ""
          }`}
        >
          {current.prestige && <div className="ov-holo" />}
          <div className="ov-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon} alt="" className="ov-badge-img" />
          </div>
          <div className="ov-text">
            <div className="ov-eyebrow">
              {current.prestige && (
                <span className="ov-tag">{current.prestigeTag ?? "Prestigio"}</span>
              )}
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
  justify-content: flex-start;
  align-items: flex-start;
  padding: 46px;
  overflow: hidden;
  font-family: var(--font-body), "Barlow Semi Condensed", Arial, Helvetica, sans-serif;
  color: #ffffff;
}

.ov-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(700px, 54vw);
  min-width: 440px;
  padding: 12px 18px 13px 14px;
  border-radius: 8px;
  background: linear-gradient(105deg, rgba(8,42,86,0.96) 0%, rgba(16,86,150,0.92) 58%, rgba(20,120,110,0.88) 100%);
  border: 1px solid rgba(150, 200, 248, 0.42);
  border-left: 4px solid #bfe6ff;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  overflow: hidden;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.ov-completed {
  background: linear-gradient(105deg, rgba(8,42,86,0.96) 0%, rgba(15,93,96,0.92) 58%, rgba(20,120,76,0.9) 100%);
  border-color: rgba(126,245,168,0.48);
  border-left-color: #39d98a;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.42),
    0 0 44px rgba(57,217,138,0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}
.ov-meta {
  background: linear-gradient(105deg, rgba(8,42,86,0.96) 0%, rgba(86,64,10,0.92) 58%, rgba(150,100,18,0.9) 100%);
  border-color: rgba(255,210,60,0.52);
  border-left-color: #ffd23c;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.42),
    0 0 48px rgba(255,210,60,0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

/* ── PRESTIGIO: diseño premium iridiscente (se superpone al tipo) ──────────── */
.ov-prestige {
  background:
    linear-gradient(105deg, rgba(13,20,54,0.97) 0%, rgba(18,84,104,0.93) 42%, rgba(86,40,120,0.92) 72%, rgba(150,110,24,0.9) 100%);
  border-color: rgba(120, 240, 220, 0.6);
  border-left: 4px solid #16e0c0;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.5),
    0 0 60px rgba(28, 220, 196, 0.32),
    0 0 90px rgba(150, 90, 230, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  animation: ovPrestigeGlow 3.4s ease-in-out infinite;
}
.ov-prestige.ov-completed,
.ov-prestige.ov-meta {
  border-left-color: #ffd23c;
}
.ov-prestige .ov-eyebrow { color: #8ff3e4; }
.ov-prestige .ov-count { color: #d8fff5; }
.ov-prestige .ov-bar-fill {
  background: linear-gradient(90deg, #19e6c4 0%, #6fd0ff 38%, #b489ff 70%, #ffd23c 100%);
}
.ov-prestige .ov-badge { animation: ovPulse 1.2s ease-in-out infinite; }

/* etiqueta "PRESTIGIO" delante del eyebrow */
.ov-tag {
  display: inline-block;
  margin-right: 8px;
  padding: 2px 8px 1px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.2px;
  vertical-align: 2px;
  color: #07221f;
  background: linear-gradient(100deg, #18e6c4 0%, #b489ff 60%, #ffd23c 100%);
  box-shadow: 0 2px 8px rgba(24,230,196,0.45);
  text-shadow: none;
}

/* barrido holográfico continuo, exclusivo del prestigio */
.ov-holo {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(120, 240, 220, 0.10) 44%,
    rgba(180, 137, 255, 0.16) 50%,
    rgba(255, 210, 60, 0.10) 56%,
    transparent 70%
  );
  background-size: 280% 100%;
  mix-blend-mode: screen;
  animation: ovHolo 3.2s linear infinite;
}

.ov-badge {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));
  animation: ovPulse 1.6s ease-in-out infinite;
}
.ov-badge-img { width: 100%; height: 100%; object-fit: contain; }

.ov-text { flex: 1; min-width: 0; display: grid; gap: 7px; z-index: 1; }
.ov-eyebrow {
  font-family: var(--font-title), "Arial Narrow", Impact, sans-serif;
  font-weight: 700;
  font-size: 18px;
  line-height: 0.95;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #bfe6ff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}
.ov-completed .ov-eyebrow { color: #7ef5a8; }
.ov-meta .ov-eyebrow { color: #ffd23c; }
.ov-quest {
  font-weight: 500;
  font-size: 22px;
  line-height: 1.12;
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.7);
}

.ov-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(2,14,36,0.6);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
  overflow: hidden;
}
.ov-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #cdecff 0%, #74c2ff 100%);
  transition: width 0.12s linear;
}
.ov-completed .ov-bar-fill { background: linear-gradient(90deg, #6ff0ad 0%, #1faa63 100%); }
.ov-meta .ov-bar-fill { background: linear-gradient(90deg, #ffe27a 0%, #f5a623 100%); }

.ov-count {
  flex-shrink: 0;
  align-self: center;
  font-family: var(--font-title), "Arial Narrow", Impact, sans-serif;
  font-weight: 700;
  font-size: 27px;
  line-height: 0.95;
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
  width: 46%;
  height: 100%;
  transform: skewX(-20deg);
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0.62) 50%, rgba(255,255,255,0.12) 76%, transparent 100%);
  filter: blur(0.2px);
  mix-blend-mode: screen;
  animation: ovShine 1.18s ease-out 0.32s 1 both;
}
.ov-completed .ov-shine {
  background: linear-gradient(90deg, transparent 0%, rgba(126,245,168,0.2) 22%, rgba(230,255,240,0.74) 50%, rgba(126,245,168,0.24) 78%, transparent 100%);
}
.ov-meta .ov-shine {
  background: linear-gradient(90deg, transparent 0%, rgba(255,210,60,0.24) 22%, rgba(255,246,190,0.8) 50%, rgba(255,210,60,0.28) 78%, transparent 100%);
}

.ov-enter { animation: ovIn ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.ov-show { transform: translateX(0); opacity: 1; }
.ov-leaving { animation: ovOut ${EXIT_MS}ms cubic-bezier(0.7, 0, 0.84, 0) both; }

@keyframes ovIn {
  0%   { transform: translateX(-130%) scale(0.96); opacity: 0; }
  70%  { transform: translateX(2%)    scale(1.02); opacity: 1; }
  100% { transform: translateX(0)    scale(1);    opacity: 1; }
}
@keyframes ovOut {
  0%   { transform: translateX(0)    scale(1);    opacity: 1; }
  100% { transform: translateX(-130%) scale(0.96); opacity: 0; }
}
@keyframes ovShine { 0% { left: -60%; } 100% { left: 130%; } }
@keyframes ovPulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
}
@keyframes ovHolo {
  0%   { background-position: 140% 0; }
  100% { background-position: -140% 0; }
}
@keyframes ovPrestigeGlow {
  0%, 100% {
    box-shadow:
      0 12px 32px rgba(0,0,0,0.5),
      0 0 52px rgba(28,220,196,0.28),
      0 0 80px rgba(150,90,230,0.18),
      inset 0 1px 0 rgba(255,255,255,0.2);
  }
  50% {
    box-shadow:
      0 12px 32px rgba(0,0,0,0.5),
      0 0 74px rgba(28,220,196,0.45),
      0 0 110px rgba(150,90,230,0.32),
      inset 0 1px 0 rgba(255,255,255,0.2);
  }
}
`;
