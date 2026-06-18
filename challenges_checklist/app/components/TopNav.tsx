"use client";

import Link from "next/link";
import FortniteIcon from "./FortniteIcon";
import { fnt, fs, navTab, titleFont } from "../lib/theme";

export type NavTab = { label: string; href: string; active?: boolean };

// Barra de navegación superior estilo lobby Fortnite (PLAY · BATTLE PASS ·
// CHALLENGES). `right` aloja el área de sesión (login / logout / admin).
export default function TopNav({
  tabs,
  right,
}: {
  tabs: NavTab[];
  right?: React.ReactNode;
}) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
        padding: "8px 14px",
        marginBottom: 18,
        borderRadius: 12,
        background: "rgba(4, 24, 58, 0.5)",
        border: `1px solid ${fnt.border}`,
        boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingRight: 8,
          }}
        >
          <FortniteIcon code="battle_star" emoji="⭐" size={26} />
          <strong
            style={{
              fontFamily: titleFont,
              fontSize: fs(22, 40),
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: fnt.yellow,
            }}
          >
            Desafíos
          </strong>
        </span>
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} style={navTab(!!t.active)}>
            {t.label}
          </Link>
        ))}
      </div>
      {right && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {right}
        </div>
      )}
    </nav>
  );
}
