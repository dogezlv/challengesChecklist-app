"use client";

import Link from "next/link";
import FortniteIcon from "./FortniteIcon";
import { bodyFont, fnt, fs, navTab, titleFont, yellowButton } from "../lib/theme";
import type { Match } from "../lib/types";

export type NavTab = { label: string; href: string; active?: boolean };

const NAV_RADIUS = 12;

/** Mismo lenguaje visual que los paneles del tracker (difuminado, no plano). */
const navPanelLook: React.CSSProperties = {
  borderRadius: NAV_RADIUS,
  border: `1px solid ${fnt.border}`,
  background:
    "linear-gradient(180deg, rgba(12, 58, 118, 0.93) 0%, rgba(6, 32, 74, 0.96) 100%)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
};

function navShell(sticky: boolean, solidSurface: boolean): React.CSSProperties {
  const panelLook: React.CSSProperties = solidSurface
    ? {
        borderRadius: NAV_RADIUS,
        border: `1px solid ${fnt.border}`,
        background:
          "linear-gradient(180deg, rgba(12, 58, 118, 0.98) 0%, rgba(6, 32, 74, 1) 100%)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
      }
    : navPanelLook;
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: fs(12, 18),
    flexWrap: "wrap",
    padding: `${fs(10, 14)} ${fs(14, 22)}`,
    ...(sticky
      ? {
          ...panelLook,
          position: "sticky",
          top: fs(6, 10),
          zIndex: 100,
          marginBottom: 18,
          marginLeft: `calc(-1 * ${fs(12, 32)})`,
          marginRight: `calc(-1 * ${fs(12, 32)})`,
        }
      : {
          borderRadius: NAV_RADIUS,
          background: "rgba(4, 24, 58, 0.5)",
          border: `1px solid ${fnt.border}`,
        }),
  };
}

function matchBtn(
  busy: boolean,
  extra?: React.CSSProperties
): React.CSSProperties {
  return {
    ...yellowButton,
    padding: `${fs(7, 10)} ${fs(12, 18)}`,
    borderRadius: 6,
    fontSize: fs(13, 18),
    opacity: busy ? 0.55 : 1,
    cursor: busy ? "not-allowed" : "pointer",
    boxShadow: "0 2px 0 rgba(0,0,0,0.18)",
    ...extra,
  };
}

export default function TopNav({
  tabs,
  right,
  sticky = false,
  solidSurface = false,
  matchControls,
}: {
  tabs: NavTab[];
  right?: React.ReactNode;
  sticky?: boolean;
  /** Sin backdrop-filter (mejor rendimiento con stream en otra ventana). */
  solidSurface?: boolean;
  matchControls?: {
    activeMatch: Match | null;
    busy: boolean;
    onStart: () => void;
    onWin: () => void;
    onEnd: () => void;
  };
}) {
  const nav = (
    <nav style={navShell(sticky, solidSurface)}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: fs(8, 14),
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: fs(6, 10),
            paddingRight: fs(4, 8),
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
              lineHeight: 1,
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: fs(8, 12),
          flexWrap: "wrap",
          marginLeft: "auto",
        }}
      >
        {matchControls && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: fs(6, 10),
              flexWrap: "wrap",
            }}
          >
            {matchControls.activeMatch ? (
              <>
                <span
                  style={{
                    fontFamily: bodyFont,
                    fontWeight: 700,
                    fontSize: fs(11, 14),
                    color: fnt.green,
                    whiteSpace: "nowrap",
                  }}
                >
                  Partida ·{" "}
                  {new Date(
                    matchControls.activeMatch.started_at
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <button
                  type="button"
                  disabled={matchControls.busy}
                  onClick={matchControls.onWin}
                  style={matchBtn(matchControls.busy)}
                >
                  Ganar
                </button>
                <button
                  type="button"
                  disabled={matchControls.busy}
                  onClick={matchControls.onEnd}
                  style={matchBtn(matchControls.busy, {
                    background:
                      "linear-gradient(180deg, #e1493a 0%, #b3271a 100%)",
                    color: "white",
                  })}
                >
                  Terminar
                </button>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontFamily: bodyFont,
                    fontWeight: 600,
                    fontSize: fs(11, 14),
                    color: fnt.textDim,
                    whiteSpace: "nowrap",
                  }}
                >
                  Sin partida
                </span>
                <button
                  type="button"
                  disabled={matchControls.busy}
                  onClick={matchControls.onStart}
                  style={matchBtn(matchControls.busy, {
                    background:
                      "linear-gradient(180deg, #7ef5a8 0%, #15803d 100%)",
                    color: "#052e16",
                  })}
                >
                  Iniciar partida
                </button>
              </>
            )}
          </div>
        )}
        {right && (
          <div style={{ display: "flex", alignItems: "center", gap: fs(8, 12) }}>
            {right}
          </div>
        )}
      </div>
    </nav>
  );

  if (!sticky) {
    return <div style={{ marginBottom: 18 }}>{nav}</div>;
  }

  return nav;
}
