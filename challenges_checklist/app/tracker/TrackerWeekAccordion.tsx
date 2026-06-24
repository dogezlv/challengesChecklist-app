"use client";

import type { ReactNode } from "react";
import BattlePassBanner from "../components/BattlePassBanner";
import { panel, fs } from "../lib/theme";

export default function TrackerWeekAccordion({
  expanded,
  onToggle,
  label,
  title,
  subtitle,
  percent,
  accent,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  title: string;
  subtitle?: string;
  percent?: number;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${accent}59`,
        boxShadow: "0 8px 26px rgba(0,0,0,0.32)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <BattlePassBanner
          label={label}
          title={title}
          subtitle={subtitle}
          percent={percent}
          accent={accent}
          flush={expanded}
          expandControl={{ expanded }}
        />
      </button>

      {expanded && (
        <div className="tracker-week-body">
          <div
            style={{
              ...panel,
              borderRadius: 0,
              border: "none",
              padding: `${fs(6, 12)} ${fs(8, 18)}`,
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
