"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  formatActionSummary,
  sectionLabel,
  type TrackerLogRow,
} from "@/app/lib/trackerLog";
import { TrackerMiniLogFeed } from "@/app/components/TrackerMiniLogFeed";
import { bodyFont, fnt, fs, panel, titleFont } from "@/app/lib/theme";
import type { Named } from "@/app/lib/types";

const PAGE = 80;

export default function TrackerLogsPanel({
  actionTypes,
}: {
  actionTypes: Named[];
}) {
  const supabase = createClient();
  const [logs, setLogs] = useState<TrackerLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const actionMap = new Map(actionTypes.map((a) => [a.code, a.display_name]));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tracker_activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (!error && data) setLogs(data as TrackerLogRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("tracker-logs-tab")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracker_activity_logs" },
        (payload) => {
          const row = payload.new as TrackerLogRow;
          setLogs((prev) => [row, ...prev].slice(0, PAGE));
        }
      )
      .subscribe();
    const onCleared = () => {
      setLogs([]);
      load();
    };
    window.addEventListener("tracker-logs-cleared", onCleared);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("tracker-logs-cleared", onCleared);
    };
  }, [supabase, load]);

  return (
    <section style={{ ...panel, padding: fs(14, 20), display: "grid", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: titleFont,
            fontSize: fs(20, 32),
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 700,
          }}
        >
          Registro de actividad
        </h2>
        <button
          type="button"
          onClick={load}
          style={{
            fontFamily: bodyFont,
            fontSize: fs(12, 15),
            padding: `${fs(6, 8)} ${fs(10, 14)}`,
            borderRadius: 6,
            border: `1px solid ${fnt.border}`,
            background: "rgba(4, 24, 58, 0.55)",
            color: fnt.textDim,
            cursor: "pointer",
          }}
        >
          Actualizar
        </button>
      </div>
      <p style={{ margin: 0, color: fnt.textMuted, fontSize: fs(12, 16) }}>
        Acciones de todos los supervisores en el panel. Tiempo real entre los 4
        usuarios con sesión iniciada.
      </p>
      {loading && logs.length === 0 ? (
        <span style={{ color: fnt.textDim }}>Cargando…</span>
      ) : logs.length === 0 ? (
        <span style={{ color: fnt.textDim }}>Aún no hay entradas.</span>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {logs.map((entry) => (
            <div
              key={entry.id}
              style={{
                borderTop: `1px solid ${fnt.borderSoft}`,
                paddingTop: 10,
              }}
            >
              <div
                style={{
                  fontFamily: bodyFont,
                  fontSize: fs(11, 14),
                  color: "#7ccafa",
                  marginBottom: 6,
                  display: "grid",
                  gap: 4,
                }}
              >
                <span>
                  {sectionLabel(entry.section, actionMap)}
                  {entry.action_code ? ` · ${entry.action_code}` : ""}
                </span>
                {formatActionSummary(entry.payload) && (
                  <span style={{ color: "#e8f4ff" }}>
                    {formatActionSummary(entry.payload)}
                  </span>
                )}
              </div>
              <TrackerMiniLogFeed
                entries={[entry]}
                showActor
                showTime
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
