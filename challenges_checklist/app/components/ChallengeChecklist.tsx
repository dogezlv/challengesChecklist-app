"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Challenge = {
  id: string;
  description: string;
  is_completed: boolean;
  created_at: string;
  type: number;
  current_value: number | null;
  target_value: number | null;
  line_id: string | null;
  phase_order: number | null;
};

export default function ChallengeChecklist({
  initialChallenges,
}: {
  initialChallenges: Challenge[];
}) {
  const supabase = createClient();
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [challenges, setChallenges] = useState(initialChallenges);

  async function loadChallenges() {
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setChallenges(data);
    }
  }

  async function toggleSimpleChallenge(challenge: Challenge) {
    setChallenges((prev) =>
      prev.map((c) =>
        c.id === challenge.id
          ? { ...c, is_completed: !c.is_completed }
          : c
      )
    );

    const { error } = await supabase
      .from("challenges")
      .update({
        is_completed: !challenge.is_completed,
      })
      .eq("id", challenge.id);

    if (error) {
      console.error(error);
      loadChallenges();
    }
  }

  async function increaseProgress(challenge: Challenge, amount: number) {
    const { error } = await supabase.rpc("increase_current_state", {
      p_challenge_id: challenge.id,
      p_increase_value: amount,
    });

    if (error) {
      console.error(error);
      return;
    }

    loadChallenges();
  }

  useEffect(() => {
    const channel = supabase
      .channel("challenges-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenges",
        },
        () => {
          loadChallenges();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {challenges.map((challenge) => {
        const current = challenge.current_value ?? 0;
        const target = challenge.target_value ?? 0;
        const percent =
          target > 0 ? Math.min((current / target) * 100, 100) : 0;

        return (
          <div
            key={challenge.id}
            style={{
              border: "1px solid #444",
              borderRadius: 12,
              padding: 16,
              background: challenge.is_completed ? "#113d22" : "#1f1f1f",
              color: "white",
            }}
          >
            <h2>{challenge.description}</h2>

            {challenge.type === 0 && (
              <>
                <p>
                  Estado:{" "}
                  {challenge.is_completed ? "Completado" : "Pendiente"}
                </p>

                <button onClick={() => toggleSimpleChallenge(challenge)}>
                  {challenge.is_completed
                    ? "Marcar como pendiente"
                    : "Completar"}
                </button>
              </>
            )}

            {challenge.type === 1 && (
              <>
                <p>
                  Progreso: {current} / {target}
                </p>

                <input
                  type="range"
                  min={0}
                  max={target}
                  //disabled={challenge.is_completed}
                  value={current}
                  onChange={(e) => {
                    const newValue = Number(e.target.value);

                    setChallenges((prev) =>
                      prev.map((c) =>
                        c.id === challenge.id
                          ? {
                              ...c,
                              current_value: newValue,
                              is_completed: target > 0 && newValue >= target,
                            }
                          : c
                      )
                    );
                  }}
                  onMouseUp={async (e) => {
                    const newValue = Number(e.currentTarget.value);

                    const { error } = await supabase
                      .from("challenges")
                      .update({
                        current_value: newValue,
                      })
                      .eq("id", challenge.id);

                    if (error) {
                      console.error(error);
                      loadChallenges();
                    }
                  }}
                  onTouchEnd={async (e) => {
                    const newValue = Number(e.currentTarget.value);

                    const { error } = await supabase
                      .from("challenges")
                      .update({
                        current_value: newValue,
                      })
                      .eq("id", challenge.id);

                    if (error) {
                      console.error(error);
                      loadChallenges();
                    }
                  }}
                  style={{ 
                    width: "100%",
                     accentColor: challenge.is_completed
                        ? "#22c55e"
                        : "#3b82f6",
                   }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    placeholder="Cantidad"
                    value={customAmounts[challenge.id] ?? ""}
                    onChange={(e) =>
                      setCustomAmounts((prev) => ({
                        ...prev,
                        [challenge.id]: Number(e.target.value),
                      }))
                    }
                    style={{ padding: 6 }}
                  />

                  <button
                    disabled={challenge.is_completed}
                    onClick={() =>
                      increaseProgress(
                        challenge,
                        customAmounts[challenge.id] || 0
                      )
                    }
                  >
                    Aumentar
                  </button>
                </div>

                <p>
                  Estado: {challenge.is_completed ? "Completado" : "Pendiente"}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}