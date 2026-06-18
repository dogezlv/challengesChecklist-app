"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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
        padding: "8px 14px",
        borderRadius: 6,
        border: "none",
        background: "linear-gradient(180deg, #e1493a 0%, #b3271a 100%)",
        color: "white",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 14,
        ...style,
      }}
    >
      Cerrar sesión
    </button>
  );
}
