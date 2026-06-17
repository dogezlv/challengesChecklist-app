"use client";

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
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #1c74e3",
        background: "#0b1d3a",
        color: "white",
        colorScheme: "dark",
        fontSize: 14,
        width: "100%",
        maxWidth: 420,
      }}
    />
  );
}
