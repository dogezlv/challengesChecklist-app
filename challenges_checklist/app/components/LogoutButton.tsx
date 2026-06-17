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
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid #7f1d1d",
        background: "transparent",
        color: "#fca5a5",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 13,
        ...style,
      }}
    >
      Cerrar sesión
    </button>
  );
}
