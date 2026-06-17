import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

// Registro de usuarios desde el panel admin. Solo administradores: el alta se
// hace con la clave de servicio (auth.admin), nunca expuesta al navegador.
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json(
      { error: "Solo administradores pueden registrar usuarios" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const isAdmin = body.isAdmin === true;

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { error: "Usuario inválido: 3-32 caracteres (letras, números, . _ -)" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // mismo mapeo usuario→email falso que usa la página de login
  const email = `${username.toLowerCase()}@checklist.local`;

  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (isAdmin && created.user) {
    const { error: adminError } = await service
      .from("admin_users")
      .insert({ user_id: created.user.id });

    if (adminError) {
      return NextResponse.json(
        {
          error: `Usuario creado, pero no se pudo hacer admin: ${adminError.message}`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    username: username.toLowerCase(),
    isAdmin,
  });
}
