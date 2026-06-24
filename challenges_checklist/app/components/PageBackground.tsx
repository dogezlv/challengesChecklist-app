"use client";

import { useEffect, useState } from "react";
import { pageBackground } from "../lib/theme";

// Fondo de página "Season X": degradado + malla triangular animada (GPU).
// En pestaña oculta o modo ligero (`html[data-lite="on"]`) las animaciones se pausan.
export default function PageBackground({ staticOnly = false }: { staticOnly?: boolean }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (staticOnly) {
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
        <div className={`fn-bg-mesh fn-bg-mesh--b${paused}`} />
      </div>
      <div className="fn-bg-fade">
        <div className={`fn-bg-mesh fn-bg-mesh--a${paused}`} />
      </div>
      <div className="fn-bg-prestige" />
    </div>
  );
}
