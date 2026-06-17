"use client";

import FortniteIcon from "./FortniteIcon";

// Tarjeta estilo "MissionModule" del wiki de Fortnite Season 8:
// borde degradado azul, título en mayúsculas, quest y progreso.
export default function MissionCard({
  title,
  quest,
  current,
  target,
  completed,
  locked = false,
  meta = false,
  children,
}: {
  title: string;
  quest: string;
  current: number;
  target: number;
  completed: boolean;
  locked?: boolean;
  meta?: boolean;
  children?: React.ReactNode;
}) {
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <div
      style={{
        borderRadius: 10,
        padding: 2,
        background: completed
          ? "linear-gradient(180deg, #7ef5a8 0%, #16a34a 100%)"
          : meta
            ? "linear-gradient(180deg, #ffd76b 0%, #b8860b 100%)"
            : "linear-gradient(180deg, #7ccafa 0%, #1c74e3 100%)",
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div
        style={{
          background: "#0d1b33",
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          color: "white",
        }}
      >
        <FortniteIcon
          code={meta ? "battle_star" : completed ? "battle_star" : null}
          emoji={completed ? "✅" : locked ? "🔒" : meta ? "⭐" : "⬜"}
          size={34}
        />

        <div style={{ flex: 1, display: "grid", gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: meta ? "#ffd76b" : "#7ccafa",
            }}
          >
            {title}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{quest}</div>

          <div
            style={{
              background: "#1e2c47",
              borderRadius: 6,
              height: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                background: completed
                  ? "linear-gradient(90deg, #7ef5a8, #16a34a)"
                  : "linear-gradient(90deg, #7ccafa, #1c74e3)",
              }}
            />
          </div>

          {children}
        </div>

        <div
          style={{
            fontWeight: 800,
            fontSize: 15,
            color: completed ? "#7ef5a8" : "#9fc9f5",
            whiteSpace: "nowrap",
          }}
        >
          {current} / {target}
        </div>
      </div>
    </div>
  );
}
