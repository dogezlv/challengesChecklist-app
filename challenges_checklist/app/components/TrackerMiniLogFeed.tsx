"use client";

import type { TrackerLogPayload, TrackerLogRow } from "@/app/lib/trackerLog";
import { formatActionSummary, formatLogTime } from "@/app/lib/trackerLog";
import { bodyFont, fs } from "@/app/lib/theme";

const box: React.CSSProperties = {
  background: "#0a1426",
  borderRadius: 8,
  padding: 10,
  display: "grid",
  gap: 4,
  fontSize: fs(12, 15),
};

function PayloadLines({ payload }: { payload: TrackerLogPayload }) {
  return (
    <>
      {payload.error && (
        <span style={{ color: "#fca5a5" }}>⚠ {payload.error}</span>
      )}
      {payload.message && !payload.error && (
        <span style={{ color: "#cfe6ff" }}>{payload.message}</span>
      )}
      {!payload.error &&
        !payload.message &&
        !payload.updated?.length &&
        !payload.skipped?.length && (
          <span style={{ color: "#fbbf24" }}>
            Ningún desafío coincide con esa combinación.
          </span>
        )}
      {payload.updated?.map((u) => (
        <span key={u.id} style={{ color: "#cfe6ff" }}>
          {u.is_completed ? "✅" : "📈"} {u.description} —{" "}
          <strong>
            {u.current_value}/{u.target_value}
          </strong>
          {u.is_completed ? " ¡Completado!" : ""}
        </span>
      ))}
      {payload.skipped?.map((s) => (
        <span key={s.id} style={{ color: "#fbbf24" }}>
          ⏸ {s.description} —{" "}
          {s.reason === "no_active_match"
            ? "requiere partida activa"
            : s.reason === "named_location_required"
              ? "requiere elegir un lugar con nombre"
              : "no aplicó"}
        </span>
      ))}
    </>
  );
}

/** Mini logs en tiempo real por sección (un usuario = una entrada, se reemplaza). */
export function TrackerMiniLogFeed({
  entries,
  showActor = true,
  showTime = false,
}: {
  entries: TrackerLogRow[];
  showActor?: boolean;
  showTime?: boolean;
}) {
  if (!entries.length) return null;

  return (
    <div style={box}>
      {entries.map((entry) => {
        const actionLine = formatActionSummary(entry.payload);
        return (
          <div key={`${entry.user_id}-${entry.id}`} style={{ display: "grid", gap: 2 }}>
            {(showActor || showTime) && (
              <span style={{ lineHeight: 1.35 }}>
                {showActor && (
                  <strong style={{ color: "#9fc9f5" }}>{entry.actor_name}</strong>
                )}
                {showTime && (
                  <span
                    style={{
                      fontFamily: bodyFont,
                      color: "#7ccafa",
                      marginLeft: showActor ? 6 : 0,
                    }}
                  >
                    {showActor ? "· " : ""}
                    {formatLogTime(entry.created_at)}
                  </span>
                )}
              </span>
            )}
            {actionLine && (
              <span style={{ color: "#e8f4ff", lineHeight: 1.35 }}>{actionLine}</span>
            )}
            <PayloadLines payload={entry.payload} />
          </div>
        );
      })}
    </div>
  );
}

/** Feedback local inmediato tras error de validación (solo este usuario). */
export function TrackerLocalResultFeed({
  result,
}: {
  result: TrackerLogPayload;
}) {
  if (!result.error) return null;
  return (
    <div style={box}>
      <PayloadLines payload={result} />
    </div>
  );
}
