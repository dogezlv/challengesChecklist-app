# Cursor — MCP Supabase

## Activar MCP

1. Abre **Cursor Settings → Tools & MCP**.
2. El servidor `supabase` se lee de `.cursor/mcp.json`.
3. En el primer uso, Cursor pedirá **login OAuth** en Supabase (recomendado).
4. Alternativa CI/token: copia `mcp.json.example` y añade header `Authorization: Bearer <PAT>`.

Config actual: proyecto `ucjuxngjmcdwggishima`, modo **read-only**.

## Verificar conexión

Pide al agente: *"Lista las tablas de la BD con MCP Supabase"*.

## Reglas del proyecto

Ver `.cursor/rules/` — contexto canónico en `CLAUDE.md` (repo root).
