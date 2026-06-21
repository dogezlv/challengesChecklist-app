"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  DIAL_DIGITS,
  dialRotationForDigit,
  holePosition,
  type PhoneDialConfig,
} from "@/app/lib/phoneDial";
import { bodyFont, fnt, fs, titleFont } from "@/app/lib/theme";

const DIAL_SIZE = 300;
const RING_SIZE = DIAL_SIZE + 36;
const HOLE_R = 17;
const HOLE_ORBIT = 106;
const CX = DIAL_SIZE / 2;
const CY = DIAL_SIZE / 2;
const CENTER_LOGO = 118;
const BALL_SIZE = 58;
/** Respuesta lenta sin deriva errática */
const PICK_LERP = 0.065;
const HIT_SLACK = 0;
const RELEASE_LAG = 0.4;

type Props = {
  config: PhoneDialConfig;
  disabled?: boolean;
  onComplete: () => void;
};

export default function GiantRotaryPhone({
  config,
  disabled = false,
  onComplete,
}: Props) {
  const target = config.number;
  const [entered, setEntered] = useState("");
  const [dialRotate, setDialRotate] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [failFlash, setFailFlash] = useState(false);
  const [inputFailed, setInputFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pickImgFailed, setPickImgFailed] = useState(false);
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
  const dialRef = useRef<HTMLDivElement>(null);
  const ballHomeRef = useRef<HTMLDivElement>(null);
  const ballPosRef = useRef({ x: 0, y: 0 });
  const targetPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const resetAttempt = useCallback(() => {
    setInputFailed(true);
    setFailFlash(true);
    window.setTimeout(() => {
      setEntered("");
      setInputFailed(false);
      setFailFlash(false);
    }, 950);
  }, []);

  const finishSequence = useCallback(
    (sequence: string) => {
      if (sequence === target) {
        setDone(true);
        onComplete();
      } else {
        resetAttempt();
      }
    },
    [onComplete, resetAttempt, target]
  );

  const animateDial = useCallback(
    (digit: string, nextEntered: string) => {
      const rot = dialRotationForDigit(digit);
      setAnimating(true);
      setDialRotate(rot);
      window.setTimeout(() => {
        setDialRotate(0);
        window.setTimeout(() => {
          setAnimating(false);
          if (nextEntered.length === target.length) {
            finishSequence(nextEntered);
          }
        }, 520);
      }, 480);
    },
    [finishSequence, target.length]
  );

  const registerDigit = useCallback(
    (digit: string) => {
      if (disabled || animating || done || entered.length >= target.length) return;
      const next = entered + digit;
      setEntered(next);
      animateDial(digit, next);
    },
    [animateDial, disabled, animating, done, entered, target.length]
  );

  const hitTestDialPoint = useCallback((clientX: number, clientY: number): string | null => {
    const dial = dialRef.current;
    if (!dial) return null;
    const rect = dial.getBoundingClientRect();
    const scaleX = DIAL_SIZE / rect.width;
    const scaleY = DIAL_SIZE / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    for (const d of DIAL_DIGITS) {
      const p = holePosition(d, HOLE_ORBIT, CX, CY);
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.hypot(dx, dy) <= HOLE_R + HIT_SLACK) return d;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!dragging) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      setBallPos((prev) => {
        const tx = targetPos.current.x;
        const ty = targetPos.current.y;
        const next = {
          x: prev.x + (tx - prev.x) * PICK_LERP,
          y: prev.y + (ty - prev.y) * PICK_LERP,
        };
        ballPosRef.current = next;
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || animating || done) return;
    e.preventDefault();
    targetPos.current = { x: e.clientX, y: e.clientY };
    setBallPos({ x: e.clientX, y: e.clientY });
    ballPosRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    targetPos.current = { x: e.clientX, y: e.clientY };
  };

  const laggedHitPoint = () => {
    const pos = ballPosRef.current;
    const tx = targetPos.current.x;
    const ty = targetPos.current.y;
    return {
      x: pos.x + (tx - pos.x) * RELEASE_LAG,
      y: pos.y + (ty - pos.y) * RELEASE_LAG,
    };
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    const hit = laggedHitPoint();
    const digit = hitTestDialPoint(hit.x, hit.y);
    if (digit) registerDigit(digit);
    setBallPos({ x: 0, y: 0 });
    ballPosRef.current = { x: 0, y: 0 };
  };

  const slotColor = (i: number) => {
    if (done) return { bg: "rgba(57, 217, 138, 0.25)", color: fnt.green };
    if (inputFailed && entered.length === target.length)
      return { bg: "rgba(225, 73, 58, 0.28)", color: fnt.red };
    if (i < entered.length)
      return { bg: "rgba(191, 230, 255, 0.18)", color: "#eaf6ff" };
    return { bg: "rgba(4, 24, 58, 0.5)", color: fnt.textMuted };
  };

  const ballStyle: React.CSSProperties = dragging
    ? {
        position: "fixed",
        left: ballPos.x,
        top: ballPos.y,
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
        pointerEvents: "none",
      }
    : { position: "relative", transform: "none" };

  const fingerStopRight = `calc(50% - ${Math.round(DIAL_SIZE / 2 + 14)}px)`;

  return (
    <div
      style={{
        display: "grid",
        gap: 20,
        justifyItems: "center",
        userSelect: "none",
        animation: failFlash ? "phoneShake 0.45s ease" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "center",
          minHeight: 28,
        }}
      >
        {target.split("").map((_, i) => {
          const colors = slotColor(i);
          return (
            <span
              key={i}
              style={{
                width: fs(28, 34),
                height: fs(28, 34),
                borderRadius: 6,
                border: `2px solid ${
                  inputFailed && i < entered.length ? fnt.red : fnt.border
                }`,
                display: "grid",
                placeItems: "center",
                fontFamily: titleFont,
                fontSize: fs(14, 18),
                background: colors.bg,
                color: colors.color,
              }}
            >
              {i < entered.length ? entered[i] : "·"}
            </span>
          );
        })}
      </div>

      <div style={{ position: "relative", width: "min(94vw, 520px)" }}>
        <div
          style={{
            height: 96,
            marginBottom: -10,
            marginLeft: "8%",
            marginRight: "8%",
            borderRadius: "36px 36px 10px 10px",
            background: `linear-gradient(180deg, ${config.handsetColor} 0%, ${config.bodyDark} 100%)`,
            boxShadow:
              "inset 0 2px 0 rgba(255,255,255,0.35), 0 8px 20px rgba(0,0,0,0.35)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 18,
              top: "50%",
              transform: "translateY(-50%)",
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: config.handsetCap,
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 18,
              top: "50%",
              transform: "translateY(-50%)",
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: config.handsetCap,
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
            }}
          />
        </div>

        <div
          style={{
            background: `linear-gradient(180deg, ${config.bodyColor} 0%, ${config.bodyDark} 100%)`,
            borderRadius: 18,
            padding: "36px 28px 40px",
            boxShadow:
              "0 20px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
            border: `3px solid ${config.bodyDark}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                width: RING_SIZE,
                height: RING_SIZE,
                borderRadius: "50%",
                background: `linear-gradient(135deg, #e8e8e8 0%, ${config.dialRing} 50%, #888 100%)`,
                display: "grid",
                placeItems: "center",
                boxShadow: "inset 0 2px 8px rgba(0,0,0,0.35)",
                position: "relative",
              }}
            >
              <div
                ref={dialRef}
                style={{
                  width: DIAL_SIZE,
                  height: DIAL_SIZE,
                  borderRadius: "50%",
                  position: "relative",
                  background: config.dialPlate,
                  transform: `rotate(${dialRotate}deg)`,
                  transition: animating
                    ? "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)"
                    : "transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1)",
                  boxShadow: "inset 0 4px 14px rgba(0,0,0,0.15)",
                }}
              >
                {DIAL_DIGITS.map((d) => {
                  const p = holePosition(d, HOLE_ORBIT, CX, CY);
                  return (
                    <div
                      key={d}
                      style={{
                        position: "absolute",
                        left: p.x - HOLE_R,
                        top: p.y - HOLE_R,
                        width: HOLE_R * 2,
                        height: HOLE_R * 2,
                        borderRadius: "50%",
                        background: "#0a1426",
                        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.9)",
                        border: "2px solid rgba(255,255,255,0.14)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: titleFont,
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#ffffff",
                          lineHeight: 1,
                          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                          pointerEvents: "none",
                        }}
                      >
                        {d}
                      </span>
                    </div>
                  );
                })}

                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: CENTER_LOGO,
                    height: CENTER_LOGO,
                    borderRadius: "50%",
                    background: config.logoBg,
                    border: "3px solid rgba(0,0,0,0.12)",
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                    padding: 6,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.22)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: titleFont,
                        fontSize: 15,
                        lineHeight: 1.08,
                        color: config.variant === "durr" ? "#c41e3a" : "#e02020",
                        fontWeight: 900,
                      }}
                    >
                      {config.logoText}
                    </div>
                    {config.logoSub && (
                      <div
                        style={{
                          fontFamily: titleFont,
                          fontSize: 13,
                          lineHeight: 1.05,
                          color: config.variant === "durr" ? "#c41e3a" : "#e02020",
                          fontWeight: 900,
                        }}
                      >
                        {config.logoSub}
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: bodyFont,
                        fontSize: 11,
                        color: "#333",
                        marginTop: 4,
                        letterSpacing: 0.5,
                      }}
                    >
                      {config.displayNumber}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                right: fingerStopRight,
                top: "50%",
                width: 22,
                height: 34,
                marginTop: -10,
                background: "linear-gradient(90deg, #aaa, #666)",
                borderRadius: "0 5px 5px 0",
                boxShadow: "2px 2px 5px rgba(0,0,0,0.35)",
                zIndex: 3,
              }}
            />
          </div>
        </div>
      </div>

      {!done && (
        <div ref={ballHomeRef} style={{ display: "grid", justifyItems: "center" }}>
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              ...ballStyle,
              width: BALL_SIZE,
              height: BALL_SIZE,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 28%, #6b4a2e, #2a1810 72%, #1a0f0a)",
              border: "3px solid #1a1008",
              boxShadow: dragging
                ? "0 10px 28px rgba(0,0,0,0.55)"
                : "0 5px 16px rgba(0,0,0,0.45)",
              cursor: animating ? "wait" : dragging ? "grabbing" : "grab",
              touchAction: "none",
              display: "grid",
              placeItems: "center",
            }}
          >
            {!pickImgFailed ? (
              <Image
                src="/icons/pickaxe.png"
                alt=""
                width={32}
                height={32}
                onError={() => setPickImgFailed(true)}
                draggable={false}
                style={{ pointerEvents: "none", userSelect: "none" }}
              />
            ) : (
              <span style={{ fontSize: 26, lineHeight: 1 }}>⛏️</span>
            )}
          </div>
        </div>
      )}

      {inputFailed && !done && (
        <p style={{ margin: 0, color: fnt.red, fontSize: fs(13, 16) }}>
          Combinación incorrecta — vuelve a marcar el número.
        </p>
      )}

      {done && (
        <p
          style={{
            margin: 0,
            fontFamily: titleFont,
            fontSize: fs(18, 26),
            color: fnt.green,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          ¡Número marcado correctamente!
        </p>
      )}

      <style jsx global>{`
        @keyframes phoneShake {
          0%,
          100% {
            transform: translateX(0);
          }
          20%,
          60% {
            transform: translateX(-8px);
          }
          40%,
          80% {
            transform: translateX(8px);
          }
        }
      `}</style>
    </div>
  );
}
