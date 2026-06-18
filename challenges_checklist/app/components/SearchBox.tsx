"use client";

import { fnt } from "../lib/theme";

export default function SearchBox({
  value,
  onChange,
  placeholder = "Buscar desafío…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        border: `1px solid ${fnt.border}`,
        background: "rgba(4, 24, 58, 0.55)",
        color: "white",
        colorScheme: "dark",
        fontSize: 14,
        width: "100%",
        maxWidth: 420,
      }}
    />
  );
}
