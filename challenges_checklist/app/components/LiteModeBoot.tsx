"use client";

import { useEffect } from "react";
import { applyLiteModeDom, LITE_MODE_EVENT, readLiteMode } from "../lib/liteMode";

/** Sincroniza `html[data-lite]` al cargar la app (antes de hidratar páginas). */
export default function LiteModeBoot() {
  useEffect(() => {
    applyLiteModeDom(readLiteMode());
    const onChange = () => applyLiteModeDom(readLiteMode());
    window.addEventListener(LITE_MODE_EVENT, onChange);
    return () => window.removeEventListener(LITE_MODE_EVENT, onChange);
  }, []);
  return null;
}
