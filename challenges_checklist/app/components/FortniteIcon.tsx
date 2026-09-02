"use client";

import { useState } from "react";

// Códigos sin PNG en public/icons/: van directo a un emoji con sentido
// en vez de intentar una imagen que daría 404 (y caer al emoji genérico).
const EMOJI_BY_CODE: Record<string, string> = {
  misc: "🎲",
  stone_pig: "🐷",
  big_telephone: "📞",
};

// Imagen de public/icons/<code>.png con fallback a emoji si no existe.
export default function FortniteIcon({
  code,
  emoji,
  size = 26,
}: {
  code: string | null | undefined;
  emoji: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const mapped = code ? EMOJI_BY_CODE[code] : undefined;
  if (!code || failed || mapped) {
    return (
      <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>
        {mapped ?? emoji}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/${code}.png`}
      width={size}
      height={size}
      style={{ objectFit: "contain", flexShrink: 0 }}
      onError={() => setFailed(true)}
      alt=""
    />
  );
}
