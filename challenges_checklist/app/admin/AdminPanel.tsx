"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import LogoutButton from "../components/LogoutButton";

type Row = {
  id: string;
  code?: string;
  display_name?: string;
  description?: string;
  created_at?: string;
};

type Challenge = Row & {
  kind?: "simple" | "progress";
};

type GameObject = Row & {
  game_object_tags?: {
    tag_id: string;
  }[];
};

function ObjectTagEditor({
  gameObjects,
  tags,
  input,
  button,
  setMessage,
}: {
  gameObjects: GameObject[];
  tags: Row[];
  input: React.CSSProperties;
  button: React.CSSProperties;
  setMessage: (message: string) => void;
}) {
  const supabase = createClient();

  const [selectedObjectId, setSelectedObjectId] =
    useState("");

  const selectedObject = gameObjects.find(
    (o) => o.id === selectedObjectId
  );

  async function updateObjectTags(formData: FormData) {
    if (!selectedObject) return;

    const selectedTags = formData
      .getAll("tag_ids")
      .map(String);

    const { error: deleteError } = await supabase
      .from("game_object_tags")
      .delete()
      .eq("object_id", selectedObject.id);

    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }

    if (selectedTags.length > 0) {
      const rows = selectedTags.map((tag_id) => ({
        object_id: selectedObject.id,
        tag_id,
      }));

      const { error: insertError } = await supabase
        .from("game_object_tags")
        .insert(rows);

      if (insertError) {
        setMessage(insertError.message);
        return;
      }
    }

    setMessage("Tags actualizados.");
    location.reload();
  }

  const currentTags =
    selectedObject?.game_object_tags?.map(
      (t) => t.tag_id
    ) ?? [];

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
      }}
    >
      <select
        value={selectedObjectId}
        onChange={(e) =>
          setSelectedObjectId(e.target.value)
        }
        style={input}
      >
        <option value="">
          Seleccionar objeto
        </option>

        {gameObjects.map((object) => (
          <option
            key={object.id}
            value={object.id}
          >
            {object.display_name}
          </option>
        ))}
      </select>

      {selectedObject && (
        <form
          action={updateObjectTags}
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          <div>
            <strong>
              {selectedObject.display_name}
            </strong>

            <div
              style={{
                fontSize: 12,
                color: "#9ca3af",
              }}
            >
              {selectedObject.code}
            </div>
          </div>

          <select
            key={selectedObject.id}
            name="tag_ids"
            multiple
            defaultValue={currentTags}
            style={{
              ...input,
              height: 200,
            }}
          >
            {tags.map((tag) => (
              <option
                key={tag.id}
                value={tag.id}
              >
                {tag.display_name}
              </option>
            ))}
          </select>

          <button style={button}>
            Guardar tags
          </button>
        </form>
      )}
    </div>
  );
}

export default function AdminPanel({
  actionTypes,
  tags,
  gameObjects,
  locations,
  challenges,
  challengeLines,
}: {
  actionTypes: Row[];
  tags: Row[];
  gameObjects: GameObject[];
  locations: Row[];
  challenges: Challenge[];
  challengeLines: Row[];
}) {
  const supabase = createClient();
  const [message, setMessage] = useState("");
  const [challengeKind, setChallengeKind] =
  useState<"simple" | "progress">("simple");

  async function registerUser(formData: FormData) {
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: String(formData.get("username")),
        password: String(formData.get("password")),
        isAdmin: formData.get("is_admin") === "on",
      }),
    });

    const data = await res.json();
    setMessage(
      res.ok
        ? `Usuario "${data.username}" creado${data.isAdmin ? " (admin)" : ""}.`
        : data.error
    );
  }
  async function createChallengeLine() {
    const { error } = await supabase.from("challenge_lines").insert({});

    if (error) setMessage(error.message);
    else location.reload();
  }

  async function createBasic(
    table: "action_types" | "tags" | "locations",
    formData: FormData
  ) {
    const { error } = await supabase.from(table).insert({
      code: String(formData.get("code")),
      display_name: String(formData.get("display_name")),
    });

    if (error) setMessage(error.message);
    else location.reload();
  }

  async function createGameObject(formData: FormData) {
    const tagIds = formData.getAll("tag_ids").map(String);

    const { data: object, error } = await supabase
      .from("game_objects")
      .insert({
        code: String(formData.get("code")),
        display_name: String(formData.get("display_name")),
      })
      .select("id")
      .single();

    if (error || !object) {
      setMessage(error?.message ?? "No se pudo crear el objeto");
      return;
    }

    if (tagIds.length > 0) {
      const rows = tagIds.map((tag_id) => ({
        object_id: object.id,
        tag_id,
      }));

      const { error: tagsError } = await supabase
        .from("game_object_tags")
        .insert(rows);

      if (tagsError) {
        setMessage(tagsError.message);
        return;
      }
    }

    location.reload();
  }

  async function createChallenge(formData: FormData) {
    const kind = String(formData.get("kind"));
    const lineId = String(formData.get("line_id"));
    const phaseOrder = String(formData.get("phase_order"));
    const rulesOperator =
      kind === "progress"
        ? String(formData.get("rules_operator"))
        : null;
    const { error } = await supabase.from("challenges").insert({
      description: String(formData.get("description")),
      kind,
      rules_operator: rulesOperator,
      current_value: kind === "progress" ? 0 : null,
      target_value:
        kind === "progress" ? Number(formData.get("target_value")) : null,
      is_completed: false,
      line_id: lineId || null,
      phase_order: lineId && phaseOrder ? Number(phaseOrder) : null,
      match_scope: String(formData.get("match_scope")),
    });
    
    if (error) setMessage(error.message);
    else location.reload();
  }

  async function createRule(formData: FormData) {
    const clean = (value: FormDataEntryValue | null) => {
      const v = String(value ?? "");
      return v === "" ? null : v;
    };

    const { error } = await supabase.from("challenge_rules").insert({
      challenge_id: String(formData.get("challenge_id")),
      action_type_id: String(formData.get("action_type_id")),
      required_object_id: clean(formData.get("required_object_id")),
      required_tag_id: clean(formData.get("required_tag_id")),
      target_object_id: clean(formData.get("target_object_id")),
      target_tag_id: clean(formData.get("target_tag_id")),
      location_id: clean(formData.get("location_id")),
    });

    if (error) setMessage(error.message);
    else location.reload();
  }
  const card: React.CSSProperties = {
    background: "#111827",
    border: "1px solid #374151",
    borderRadius: 16,
    padding: 20,
    color: "white",
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
  };

  const input: React.CSSProperties = {
    padding: "10px 35px 10px 10px", // Más espacio a la derecha para tu flecha personalizada
    borderRadius: 8,
    border: "1px solid #4b5563",
    background: "#020617",
    color: "white",
    width: "100%",                  // Se adapta al tamaño del div contenedor
    colorScheme: "dark",            // Hace que las opciones desplegables sean oscuras en navegadores modernos
  };
  const form: React.CSSProperties = {
    display: "grid",
    gap: 10,
  };

  const button: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#020617", padding: 40 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ color: "white", fontSize: 36, margin: 0 }}>Panel Admin</h1>
        <nav style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Link href="/" style={{ color: "#60a5fa", fontWeight: 700 }}>
            Checklist
          </Link>
          <Link href="/tracker" style={{ color: "#60a5fa", fontWeight: 700 }}>
            Panel de supervisión
          </Link>
          <LogoutButton />
        </nav>
      </header>

      {message && (
        <p style={{ background: "#7f1d1d", color: "white", padding: 12 }}>
          {message}
        </p>
      )}

      <div style={grid}>
        <section style={card}>
          <h2>Registrar usuario</h2>

          <form action={registerUser} style={form}>
            <input
              name="username"
              placeholder="Nombre de usuario"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9._\-]+"
              title="Letras, números, punto, guion y guion bajo"
              style={input}
            />
            <input
              name="password"
              type="password"
              placeholder="Contraseña (mínimo 6 caracteres)"
              required
              minLength={6}
              style={input}
            />
            <label style={{ color: "#d1d5db", display: "flex", gap: 8, alignItems: "center" }}>
              <input name="is_admin" type="checkbox" />
              Hacerlo administrador
            </label>
            <button style={button}>Crear usuario</button>
          </form>
        </section>

        <section style={card}>
          <h2>Crear challenge</h2>

          <form action={createChallenge} style={form}>
            <input
              name="description"
              placeholder="Descripción del challenge"
              required
              style={input}
            />

            <select
              name="kind"
              value={challengeKind}
              onChange={(e) =>
                setChallengeKind(e.target.value as "simple" | "progress")
              }
              style={input}
            >
              <option value="simple">Simple</option>
              <option value="progress">Progreso numérico</option>
            </select>
            <input
              name="target_value"
              type="number"
              placeholder="Objetivo numérico, ej: 500"
              style={input}
            />

            {challengeKind === "progress" && (
              <select
                name="rules_operator"
                defaultValue="and"
                style={input}
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            )}

            <select name="line_id" style={input}>
              <option value="">Sin línea / independiente</option>
              {challengeLines.map((line, index) => (
                <option key={line.id} value={line.id}>
                  Línea #{index + 1} — {line.id.slice(0, 8)}
                </option>
              ))}
            </select>

            <input
              name="phase_order"
              type="number"
              placeholder="Orden en la línea, ej: 1, 2, 3"
              style={input}
            />
            
            <select name="match_scope" defaultValue="any_match" style={input}>
              <option value="any_match">Any match</option>
              <option value="same_match">Same match</option>
              <option value="different_matches">Different matches</option>
            </select>
            
            <button style={button}>Crear challenge</button>
          </form>

          <button
            onClick={createChallengeLine}
            style={{ ...button, marginTop: 12, background: "#16a34a" }}
          >
            Crear nueva línea de challenges
          </button>
        </section>

        <section style={card}>
          <h2>Crear rule</h2>

          <form action={createRule} style={form}>
            <select name="challenge_id" required style={input}>
              <option value="">Seleccionar challenge</option>
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.description}
                </option>
              ))}
            </select>

            <select name="action_type_id" required style={input}>
              <option value="">Action type</option>
              {actionTypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>

            <select name="required_object_id" style={input}>
              <option value="">Objeto usado específico</option>
              {gameObjects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                </option>
              ))}
            </select>

            <select name="required_tag_id" style={input}>
              <option value="">Tag usado</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                </option>
              ))}
            </select>

            <select name="target_object_id" style={input}>
              <option value="">Target específico</option>
              {gameObjects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                </option>
              ))}
            </select>

            <select name="target_tag_id" style={input}>
              <option value="">Target tag</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                </option>
              ))}
            </select>

            <select name="location_id" style={input}>
              <option value="">Location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.display_name}
                </option>
              ))}
            </select>

            <button style={button}>Crear rule</button>
          </form>
        </section>

        <section style={card}>
          <h2>Crear game object</h2>

          <form action={createGameObject} style={form}>
            <input name="code" placeholder="pump_shotgun" required style={input} />
            <input
              name="display_name"
              placeholder="Escopeta de corredera"
              required
              style={input}
            />

            <label style={{ color: "#d1d5db" }}>
              Tags del objeto
              <select
                name="tag_ids"
                multiple
                style={{ ...input, width: "100%", height: 150, marginTop: 8 }}
              >
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            </label>

            <button style={button}>Crear objeto con tags</button>
          </form>
        </section>

        <section style={card}>
          <h2>Modificar tags de objetos</h2>

          <ObjectTagEditor
            gameObjects={gameObjects}
            tags={tags}
            input={input}
            button={button}
            setMessage={setMessage}
          />
        </section>

        <section style={card}>
          <h2>Crear tag</h2>
          <form action={(fd) => createBasic("tags", fd)} style={form}>
            <input name="code" placeholder="shotgun" required style={input} />
            <input name="display_name" placeholder="Escopeta" required style={input} />
            <button style={button}>Crear tag</button>
          </form>
        </section>

        <section style={card}>
          <h2>Crear action type</h2>
          <form action={(fd) => createBasic("action_types", fd)} style={form}>
            <input name="code" placeholder="damage" required style={input} />
            <input name="display_name" placeholder="Daño" required style={input} />
            <button style={button}>Crear action</button>
          </form>
        </section>

        <section style={card}>
          <h2>Crear location</h2>
          <form action={(fd) => createBasic("locations", fd)} style={form}>
            <input name="code" placeholder="tilted_towers" required style={input} />
            <input
              name="display_name"
              placeholder="Tilted Towers"
              required
              style={input}
            />
            <button style={button}>Crear location</button>
          </form>
        </section>
      </div>
    </main>
  );
}