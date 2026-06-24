"use client";

import { useEffect, useState } from "react";
import { useLiteMode } from "../lib/liteMode";
import { pageBackground } from "../lib/theme";

// Fondo de página "Season X": degradado + malla triangular animada (GPU).
// Modo ligero (html[data-lite="on"]) o pestaña oculta: malla pausada.
export default function PageBackground({ staticOnly = false }: { staticOnly?: boolean }) {
  const { lite } = useLiteMode();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const staticBg = staticOnly || lite;

  if (staticBg) {
    return (
      <div
        className="fn-bg"
        aria-hidden
        style={{ background: pageBackground }}
      />
    );
  }

  const paused = hidden ? " fn-bg--paused" : "";

  return (
    <div className={`fn-bg${paused}`} aria-hidden style={{ background: pageBackground }}>
      <div className="fn-bg-fade">
        <div className="fn-bg-mesh fn-bg-mesh--b" />
      </div>
      <div className="fn-bg-fade">
        <div className="fn-bg-mesh fn-bg-mesh--a" />
      </div>
      <div className="fn-bg-prestige" />
    </div>
  );
}
