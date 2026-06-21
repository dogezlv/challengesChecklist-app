"use client";

import { yellowButton } from "../lib/theme";

export default function PrestigeViewToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        ...yellowButton,
        fontSize: 14,
        padding: "10px 14px",
        borderRadius: 999,
        lineHeight: 1.2,
        letterSpacing: 0.6,
        flexShrink: 0,
        boxShadow: "0 2px 0 rgba(0,0,0,0.18)",
      }}
    >
      {active ? "Ver normal" : "Ver prestigio"}
    </button>
  );
}
