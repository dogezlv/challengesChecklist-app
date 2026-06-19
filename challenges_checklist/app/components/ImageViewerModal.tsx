"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { bodyFont, fnt, fs, panel, titleFont } from "@/app/lib/theme";

export default function ImageViewerModal({
  title,
  src,
  alt,
  onClose,
}: {
  title: string;
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(2, 10, 28, 0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panel,
          position: "relative",
          width: "min(960px, 96vw)",
          maxHeight: "92vh",
          padding: `${fs(14, 20)} ${fs(16, 24)} ${fs(16, 24)}`,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          display: "grid",
          gap: fs(10, 14),
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: "absolute",
            top: fs(8, 12),
            right: fs(8, 12),
            width: fs(32, 40),
            height: fs(32, 40),
            borderRadius: 8,
            border: `1px solid ${fnt.border}`,
            background: "#10254a",
            color: "#eaf6ff",
            cursor: "pointer",
            fontSize: fs(18, 22),
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          ×
        </button>
        <h2
          style={{
            margin: 0,
            paddingRight: fs(36, 48),
            fontFamily: titleFont,
            fontSize: fs(16, 22),
            fontWeight: 700,
            textTransform: "uppercase",
            color: fnt.yellow,
          }}
        >
          {title}
        </h2>
        <div
          style={{
            overflow: "auto",
            maxHeight: "calc(92vh - 80px)",
            borderRadius: 10,
            border: `1px solid ${fnt.borderSoft}`,
            background: "#0a1628",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              maxWidth: "100%",
            }}
          />
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: bodyFont,
            fontSize: fs(12, 15),
            color: fnt.textMuted,
          }}
        >
          Pulsa fuera de la imagen, la X o Escape para cerrar.
        </p>
      </div>
    </div>,
    document.body
  );
}
