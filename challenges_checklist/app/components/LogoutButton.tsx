"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { fs, titleFont } from "../lib/theme";

export default function LogoutButton({ style }: { style?: React.CSSProperties }) {
  const supabase = createClient();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      style={{
        fontFamily: titleFont,
        padding: `${fs(8, 13)} ${fs(14, 22)}`,
        borderRadius: 6,
        border: "none",
        background: "linear-gradient(180deg, #e1493a 0%, #b3271a 100%)",
        color: "white",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: fs(14, 20),
        letterSpacing: 0.6,
        textTransform: "uppercase",
        lineHeight: 1,
        boxShadow: "0 2px 0 rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      Cerrar sesión
    </button>
  );
}
