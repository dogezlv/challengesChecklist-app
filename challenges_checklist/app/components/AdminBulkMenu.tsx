"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import { bodyFont, fnt, fs, panel, titleFont, yellowButton } from "@/app/lib/theme";

export type AdminBulkAction =
  | "reset_all"
  | "complete_normals"
  | "complete_prestiges"
  | "reset_normals"
  | "reset_prestiges"
  | "reset_matches"
  | "clear_tracker_logs";

type ActionDef = {
  id: AdminBulkAction;
  label: string;
  rpc: string;
  description: string;
  confirm: string;
  destructive?: boolean;
  prestigeOnly?: boolean;
  /** Si true, la RPC recibe p_season_code (db/54). */
  seasonScoped?: boolean;
};

const ACTIONS: ActionDef[] = [
  {
    id: "reset_all",
    label: "Reiniciar todo",
    rpc: "reset_all_progress",
    description: "Borra el progreso de la temporada seleccionada",
    confirm:
      "Se reiniciará TODO el progreso de esta temporada (normales y prestigios). Las partidas activas no se borran. ¿Continuar?",
    destructive: true,
    seasonScoped: true,
  },
  {
    id: "complete_normals",
    label: "Completar normales",
    rpc: "complete_normals",
    description: "Marca los desafíos normales de esta temporada como hechos",
    confirm: "¿Completar todos los desafíos normales de esta temporada?",
    seasonScoped: true,
  },
  {
    id: "complete_prestiges",
    label: "Completar prestigios",
    rpc: "complete_prestiges",
    description: "Marca los prestigios de esta temporada como hechos",
    confirm: "¿Completar todos los desafíos de prestigio de esta temporada?",
    prestigeOnly: true,
    seasonScoped: true,
  },
  {
    id: "reset_normals",
    label: "Reiniciar normales",
    rpc: "reset_normals",
    description: "Pone a cero el progreso normal de esta temporada",
    confirm: "¿Reiniciar el progreso de los desafíos normales de esta temporada?",
    destructive: true,
    seasonScoped: true,
  },
  {
    id: "reset_prestiges",
    label: "Reiniciar prestigios",
    rpc: "reset_prestiges",
    description: "Pone a cero el progreso de prestigio de esta temporada",
    confirm: "¿Reiniciar el progreso de los prestigios de esta temporada?",
    destructive: true,
    prestigeOnly: true,
    seasonScoped: true,
  },
  {
    id: "reset_matches",
    label: "Reiniciar partidas",
    rpc: "reset_matches",
    description: "Limpia progreso por partida de esta temporada",
    confirm:
      "¿Limpiar el progreso ligado a partidas de esta temporada y desbloquear fases bloqueadas?",
    destructive: true,
    seasonScoped: true,
  },
  {
    id: "clear_tracker_logs",
    label: "Borrar logs del tracker",
    rpc: "clear_tracker_logs",
    description: "Elimina todo el registro de actividad del panel",
    confirm: "¿Borrar todos los logs de supervisión? No se puede deshacer.",
    destructive: true,
  },
];

function ConfirmOverlay({
  action,
  seasonLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  action: ActionDef;
  seasonLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-bulk-title"
      onClick={() => !busy && onCancel()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(2, 10, 28, 0.62)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panel,
          width: "min(440px, 94vw)",
          padding: `${fs(18, 24)} ${fs(20, 28)}`,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <h2
          id="admin-bulk-title"
          style={{
            margin: "0 0 10px",
            fontFamily: titleFont,
            fontSize: fs(18, 24),
            fontWeight: 700,
            textTransform: "uppercase",
            color: action.destructive ? fnt.red : fnt.yellow,
          }}
        >
          {action.label}
        </h2>
        <p
          style={{
            margin: "0 0 8px",
            fontFamily: bodyFont,
            fontSize: fs(12, 15),
            color: fnt.textMuted,
          }}
        >
          Temporada: <strong style={{ color: fnt.textDim }}>{seasonLabel}</strong>
        </p>
        <p
          style={{
            margin: "0 0 22px",
            fontFamily: bodyFont,
            fontSize: fs(14, 17),
            lineHeight: 1.45,
            color: fnt.textDim,
          }}
        >
          {action.confirm}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${fnt.border}`,
              background: "transparent",
              color: fnt.textDim,
              fontFamily: titleFont,
              fontWeight: 700,
              fontSize: fs(13, 15),
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              ...(action.destructive
                ? {
                    padding: "10px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: fnt.red,
                    color: "white",
                    fontFamily: titleFont,
                    fontWeight: 700,
                    fontSize: fs(13, 15),
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }
                : yellowButton),
              padding: "10px 18px",
              width: "auto",
            }}
          >
            {busy ? "Aplicando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AdminBulkMenu({
  seasonCode,
  seasonLabel,
  hasPrestige = true,
  onDone,
}: {
  seasonCode: string;
  seasonLabel: string;
  hasPrestige?: boolean;
  onDone: () => void;
}) {
  const supabase = createClient();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ActionDef | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleActions = ACTIONS.filter(
    (a) => !a.prestigeOnly || hasPrestige
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    const { error } = await supabase.rpc(
      pending.rpc,
      pending.seasonScoped ? { p_season_code: seasonCode } : {}
    );
    setBusy(false);
    setPending(null);
    if (error) {
      alert(error.message);
      return;
    }
    if (pending.id === "clear_tracker_logs") {
      window.dispatchEvent(new Event("tracker-logs-cleared"));
    }
    onDone();
  }

  return (
    <>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${fnt.border}`,
            background: "rgba(4, 24, 58, 0.75)",
            color: fnt.text,
            fontFamily: titleFont,
            fontWeight: 700,
            fontSize: fs(13, 15),
            cursor: "pointer",
          }}
        >
          Acciones admin
          <span style={{ fontSize: 10, opacity: 0.8 }}>{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 240,
              zIndex: 500,
              background: fnt.panelSolid,
              border: `1px solid ${fnt.border}`,
              padding: "6px 0",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            }}
          >
            {visibleActions.map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setPending(a);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: bodyFont,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(12, 48, 100, 0.55)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontFamily: titleFont,
                    fontWeight: 700,
                    fontSize: fs(13, 15),
                    color: a.destructive ? fnt.red : fnt.text,
                  }}
                >
                  {a.label}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: fs(11, 13),
                    color: fnt.textMuted,
                  }}
                >
                  {a.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pending && (
        <ConfirmOverlay
          action={pending}
          seasonLabel={seasonLabel}
          busy={busy}
          onConfirm={runAction}
          onCancel={() => !busy && setPending(null)}
        />
      )}
    </>
  );
}
