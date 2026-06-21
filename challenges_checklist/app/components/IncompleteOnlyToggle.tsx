"use client";

import { bodyFont, fnt, fs } from "../lib/theme";

/** Filtro global: oculta misiones ya completadas en la lista semanal. */
export default function IncompleteOnlyToggle({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontFamily: bodyFont,
        fontSize: fs(13, 15),
        color: active ? "#7ef5a8" : fnt.textDim,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onChange(e.target.checked)}
        style={{ margin: 0, width: 16, height: 16, cursor: "pointer" }}
      />
      Solo pendientes
    </label>
  );
}
