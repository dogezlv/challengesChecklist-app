"use client";

import { useState } from "react";
import FortniteIcon from "./FortniteIcon";
import ImageViewerModal from "./ImageViewerModal";
import {
  getMissionVisual,
  visualButtonIcon,
  type MissionVisual,
} from "@/app/lib/missionAssets";
import { accentFill, bodyFont, fnt, fs, progressTrack, titleFont } from "../lib/theme";

export default function MissionRow({
  quest,
  current,
  target,
  completed,
  locked = false,
  meta = false,
  accent = "#bfe6ff",
  lockedLabel,
  first = false,
  visual,
  children,
}: {
  quest: string;
  current: number;
  target: number;
  completed: boolean;
  locked?: boolean;
  meta?: boolean;
  accent?: string;
  lockedLabel?: string;
  first?: boolean;
  visual?: MissionVisual | null;
  children?: React.ReactNode;
}) {
  const [viewer, setViewer] = useState<MissionVisual | null>(null);
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const color = completed ? fnt.green : meta ? fnt.gold : accent;
  const showVisual = !locked && visual && !completed;

  return (
    <>
      <div
        style={{
          padding: `${fs(11, 18)} ${fs(8, 16)}`,
          borderTop: first ? "none" : `1px solid ${fnt.borderSoft}`,
          background: completed
            ? "rgba(12, 70, 48, 0.20)"
            : meta
              ? "rgba(86, 64, 10, 0.22)"
              : "transparent",
          opacity: locked ? 0.55 : 1,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${fs(26, 40)} 1fr auto`,
            gap: fs(10, 18),
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {completed ? (
              <span style={{ color: fnt.green, fontSize: fs(18, 28) }}>✓</span>
            ) : locked ? (
              <span style={{ fontSize: fs(14, 22) }}>🔒</span>
            ) : meta ? (
              <FortniteIcon code="battle_star" emoji="⭐" size={22} />
            ) : (
              <span
                style={{
                  color,
                  fontWeight: 900,
                  fontSize: fs(20, 32),
                  lineHeight: 1,
                }}
              >
                ›
              </span>
            )}
          </div>

          <div style={{ display: "grid", gap: fs(7, 11), minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: fs(8, 12),
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontFamily: bodyFont,
                  fontWeight: 600,
                  fontSize: fs(15, 24),
                  lineHeight: 1.18,
                  color: locked ? fnt.textMuted : "#eaf6ff",
                  flex: "1 1 200px",
                  minWidth: 0,
                }}
              >
                {locked ? (lockedLabel ?? quest) : quest}
              </div>
              {showVisual && (
                <button
                  type="button"
                  onClick={() => setViewer(visual)}
                  title={visual.title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: fs(5, 8),
                    padding: `${fs(4, 6)} ${fs(8, 12)}`,
                    borderRadius: 8,
                    border: "1px solid #2c4a7c",
                    background: "#10254a",
                    color: "#9fc9f5",
                    cursor: "pointer",
                    fontSize: fs(11, 14),
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  <FortniteIcon
                    code={
                      visual.kind === "loading_screen"
                        ? "treasure_map_magnify"
                        : "treasure_signpost"
                    }
                    emoji={visual.kind === "loading_screen" ? "🔍" : "🗺️"}
                    size={18}
                  />
                  {visual.buttonLabel}
                </button>
              )}
            </div>
            {!locked && (
              <div style={{ ...progressTrack, height: fs(5, 8) }}>
                <div
                  style={
                    completed
                      ? {
                          width: "100%",
                          height: "100%",
                          borderRadius: 999,
                          background: fnt.fillDone,
                        }
                      : accentFill(percent, color)
                  }
                />
              </div>
            )}
          </div>

          {!locked && (
            <div
              style={{
                fontFamily: titleFont,
                fontSize: fs(15, 25),
                color: completed ? fnt.green : meta ? fnt.gold : fnt.textDim,
                whiteSpace: "nowrap",
                paddingLeft: fs(6, 12),
              }}
            >
              {current} / {target}
            </div>
          )}
        </div>

        {!locked && children && (
          <div style={{ marginTop: fs(8, 13) }}>{children}</div>
        )}
      </div>

      {viewer && (
        <ImageViewerModal
          title={viewer.title}
          src={viewer.src}
          alt={viewer.title}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
