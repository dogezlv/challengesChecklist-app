"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tracker-lite-mode";
export const LITE_MODE_EVENT = "app-lite-mode-change";

export function readLiteMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyLiteModeDom(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.lite = on ? "on" : "off";
}

export function writeLiteMode(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  applyLiteModeDom(on);
  window.dispatchEvent(new Event(LITE_MODE_EVENT));
}

export function toggleLiteMode(): boolean {
  const next = !readLiteMode();
  writeLiteMode(next);
  return next;
}

export function useLiteMode(initialFromUrl = false) {
  const [lite, setLite] = useState(initialFromUrl);

  const sync = useCallback(() => {
    setLite(readLiteMode() || initialFromUrl);
  }, [initialFromUrl]);

  useEffect(() => {
    if (initialFromUrl && !readLiteMode()) {
      writeLiteMode(true);
    } else {
      applyLiteModeDom(readLiteMode() || initialFromUrl);
      sync();
    }
    window.addEventListener(LITE_MODE_EVENT, sync);
    return () => window.removeEventListener(LITE_MODE_EVENT, sync);
  }, [initialFromUrl, sync]);

  const toggleLite = useCallback(() => {
    toggleLiteMode();
  }, []);

  return { lite, toggleLite };
}

/** @deprecated usa useLiteMode */
export const useTrackerLiteMode = useLiteMode;
