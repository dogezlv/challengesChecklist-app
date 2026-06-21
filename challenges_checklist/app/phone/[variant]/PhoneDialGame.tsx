"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import GiantRotaryPhone from "@/app/components/GiantRotaryPhone";
import PageBackground from "@/app/components/PageBackground";
import { PHONE_CONFIGS, type PhoneVariant } from "@/app/lib/phoneDial";
import { blueButton, contentWrap, fnt, fs, pageMain, titleFont } from "@/app/lib/theme";

export default function PhoneDialGame({
  variant,
  secret,
}: {
  variant: PhoneVariant;
  secret: string;
}) {
  const config = PHONE_CONFIGS[variant];
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const onComplete = useCallback(async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/phone/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant, secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al registrar");
      setStatus("saved");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error");
      setStatus("error");
    }
  }, [secret, variant]);

  return (
    <main style={pageMain}>
      <PageBackground />
      <div style={contentWrap}>
        <header style={{ marginBottom: 24, textAlign: "center" }}>
          <h1
            style={{
              fontFamily: titleFont,
              fontSize: fs(24, 40),
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Teléfono gigante — {config.label}
          </h1>
        </header>

        <GiantRotaryPhone
          config={config}
          disabled={status === "saving" || status === "saved"}
          onComplete={() => {
            void onComplete();
          }}
        />

        {status === "saving" && (
          <p style={{ textAlign: "center", color: fnt.textDim, marginTop: 16 }}>
            Registrando…
          </p>
        )}
        {status === "saved" && (
          <p
            style={{
              textAlign: "center",
              color: fnt.green,
              marginTop: 16,
              fontSize: fs(14, 18),
            }}
          >
            ¡Listo! El desafío quedó marcado en la checklist.
          </p>
        )}
        {status === "error" && (
          <p style={{ textAlign: "center", color: fnt.red, marginTop: 16 }}>
            {errorMsg}
          </p>
        )}

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <Link href="/" style={{ ...blueButton, textDecoration: "none" }}>
            Ver checklist
          </Link>
        </div>
      </div>
    </main>
  );
}
