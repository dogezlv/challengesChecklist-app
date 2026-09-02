"use client";

import { memo, useState, type ReactNode } from "react";
import MissionRow from "./MissionRow";
import type { MissionVisual } from "@/app/lib/missionAssets";

/** Envuelve MissionRow con preview local del slider (no re-renderiza el panel entero). */
function MissionProgressDisplay({
  quest,
  current,
  target,
  completed,
  locked = false,
  accent = "#bfe6ff",
  first = false,
  visual,
  showSlider,
  children,
}: {
  quest: string;
  current: number;
  target: number;
  completed: boolean;
  locked?: boolean;
  accent?: string;
  first?: boolean;
  visual?: MissionVisual | null;
  showSlider: boolean;
  children: (preview: {
    onPreview: (v: number) => void;
    clearPreview: () => void;
  }) => ReactNode;
}) {
  const [live, setLive] = useState<number | undefined>();

  const displayCurrent =
    showSlider && live !== undefined ? live : current;
  const displayCompleted =
    showSlider && live !== undefined ? live >= target : completed;

  return (
    <MissionRow
      quest={quest}
      current={displayCurrent}
      target={target}
      completed={displayCompleted}
      locked={locked}
      accent={accent}
      first={first}
      visual={visual}
    >
      {children({
        onPreview: setLive,
        clearPreview: () => setLive(undefined),
      })}
    </MissionRow>
  );
}

export default memo(MissionProgressDisplay);
