"use client";

import { memo, useEffect, useState } from "react";
import { accentFill, fs, progressTrack } from "../lib/theme";

function MissionProgressSlider({
  challengeId,
  current,
  target,
  locked,
  accent,
  onPreview,
  onCommit,
}: {
  challengeId: string;
  current: number;
  target: number;
  locked: boolean;
  accent: string;
  onPreview?: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = useState(current);

  useEffect(() => {
    setLocal(current);
  }, [challengeId, current]);

  return (
    <input
      type="range"
      min={0}
      max={target}
      disabled={locked}
      value={local}
      onChange={(e) => {
        const v = Number(e.target.value);
        setLocal(v);
        onPreview?.(v);
      }}
      onMouseUp={(e) => onCommit(Number(e.currentTarget.value))}
      onTouchEnd={(e) => onCommit(Number(e.currentTarget.value))}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onCommit(Number(e.currentTarget.value));
        }
      }}
      style={{
        width: "100%",
        accentColor: accent,
        opacity: locked ? 0.5 : 1,
      }}
    />
  );
}

export default memo(MissionProgressSlider);

export function MissionProgressTrack({
  current,
  target,
  completed,
  accent,
}: {
  current: number;
  target: number;
  completed: boolean;
  accent: string;
}) {
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div style={{ ...progressTrack, height: fs(5, 8) }}>
      <div
        style={
          completed
            ? {
                width: "100%",
                height: "100%",
                borderRadius: 999,
              }
            : accentFill(percent, accent)
        }
      />
    </div>
  );
}
