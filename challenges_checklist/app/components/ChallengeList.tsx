"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Challenge = {
  id: string;
  title: string;
  completed: boolean;
};

export default function ChallengeList({
  initialChallenges,
}: {
  initialChallenges: Challenge[];
}) {
  const [challenges, setChallenges] =
    useState(initialChallenges);

  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel("realtime-challenges")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenges",
        },
        async () => {
          const { data } = await supabase
            .from("challenges")
            .select("*")
            .order("position");

          if (data) {
            setChallenges(data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function toggleChallenge(
    id: string,
    completed: boolean
  ) {
    await supabase
      .from("challenges")
      .update({
        completed: !completed,
      })
      .eq("id", id);
  }

  return (
    <div>
      {challenges.map((challenge) => (
        <div
          key={challenge.id}
          style={{
            border: "1px solid gray",
            marginBottom: "10px",
            padding: "10px",
          }}
        >
          <h2>{challenge.title}</h2>

          <p>
            {challenge.completed
              ? "Completado"
              : "Pendiente"}
          </p>

          <button
            onClick={() =>
              toggleChallenge(
                challenge.id,
                challenge.completed
              )
            }
          >
            Toggle
          </button>
        </div>
      ))}
    </div>
  );
}