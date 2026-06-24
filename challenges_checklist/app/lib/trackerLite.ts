"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tracker-lite-mode";

export function readLiteMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLiteMode(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.lite = on ? "on" : "off";
}

export function useTrackerLiteMode(initialFromUrl = false) {
  const [lite, setLite] = useState(initialFromUrl);

  useEffect(() => {
    const stored = readLiteMode();
    const on = initialFromUrl || stored;
    setLite(on);
    document.documentElement.dataset.lite = on ? "on" : "off";
  }, [initialFromUrl]);

  const toggleLite = () => {
    setLite((prev) => {
      const next = !prev;
      writeLiteMode(next);
      return next;
    });
  };

  return { lite, setLite, toggleLite };
}
