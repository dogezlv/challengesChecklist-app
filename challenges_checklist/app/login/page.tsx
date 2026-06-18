"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import FortniteIcon from "../components/FortniteIcon";
import { fnt, pageMain, panel, yellowButton } from "../lib/theme";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function usernameToEmail(username: string) {
    return `${username.toLowerCase()}@checklist.local`;
  }

  async function login() {
    const email = usernameToEmail(username);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const input: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${fnt.border}`,
    background: "rgba(4, 24, 58, 0.55)",
    color: "white",
    colorScheme: "dark",
    fontSize: 15,
    width: "100%",
  };

  return (
    <main
      style={{
        ...pageMain,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          ...panel,
          width: "100%",
          maxWidth: 380,
          padding: 28,
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <FortniteIcon code="battle_star" emoji="⭐" size={34} />
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: fnt.yellow,
            }}
          >
            Iniciar sesión
          </h1>
        </div>

        <input
          placeholder="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={input}
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          style={input}
        />

        <button onClick={login} style={{ ...yellowButton, width: "100%" }}>
          Entrar
        </button>
      </div>
    </main>
  );
}
