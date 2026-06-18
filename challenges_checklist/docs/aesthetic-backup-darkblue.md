# Respaldo de estética — "Azul oscuro" (previo a Season X)

Snapshot de la estética que tenía la app antes del rediseño "Season X / Road Trip"
(2026-06-17). Si el rediseño no convence, estos son los valores para restaurar.

## Paleta original

| Uso | Valor |
| --- | --- |
| Fondo de página | `linear-gradient(180deg, #050d1f 0%, #0a1a38 60%, #102448 100%)` (fixed) |
| Fondo de tarjeta / panel | `#0d1b33` |
| Borde principal | `1px solid #1c74e3` |
| Borde sutil / separadores | `#1e2c47`, `#2c4a7c` |
| Fondo de chip/toggle | `#10254a` |
| Degradado azul "activo" (botones, barras, tabs) | `linear-gradient(180deg, #7ccafa 0%, #1c74e3 100%)` |
| Texto principal | `white` |
| Texto secundario / acento azul | `#7ccafa`, `#9fc9f5`, `#cfe6ff`, `#5d8fc4` |
| Verde completado | `linear-gradient(180deg, #7ef5a8 0%, #16a34a 100%)`, texto `#7ef5a8` |
| Oro meta | `linear-gradient(180deg, #ffd76b 0%, #b8860b 100%)`, texto `#ffd76b` |
| Rojo (peligro/reset) | `#b91c1c`, `#f87171`, `#fca5a5` |
| Amarillo (avisos) | `#fbbf24` |
| Track de barra de progreso | `#1e2c47` (8px alto) |

## MissionCard original (estructura)

- Contenedor con `borderRadius: 10`, `padding: 2` y fondo = degradado (azul / verde
  completado / oro meta) que hace de **borde degradado**.
- Interior `#0d1b33`, `borderRadius: 8`, `padding: "10px 14px"`, layout flex horizontal:
  icono (34px) · bloque central (título mayúsculas 11px + quest 14px + barra 8px) · contador
  `current / target` a la derecha (15px bold).
- `locked` => `opacity: 0.55`.

## WeekTabs original

- Botones de semana: `padding 8px 16px`, `borderRadius 8`, `border 1px solid #1c74e3`,
  fondo `#0b1d3a`, texto `#9fc9f5`, mayúsculas. Activo: degradado azul + borde `#7ccafa`.
- Botones de temporada: tarjeta 190×72 con `url(/seasons/<code>.png)` de fondo, nombre
  abajo sobre degradado oscuro; seleccionada con borde `#ffd76b` + glow.

## globals.css original

```css
:root { --background: #ffffff; --foreground: #171717; }
@media (prefers-color-scheme: dark) { :root { --background: #0a0a0a; --foreground: #ededed; } }
body { background: var(--background); color: var(--foreground); font-family: Arial, Helvetica, sans-serif; }
```

## Notas

- Las páginas (`page.tsx`, `tracker`) usaban el fondo azul oscuro fijo con `padding: 28`.
- Todo el estilo es inline (`style={{...}}`), no clases de Tailwind.
- Tras el rediseño, los valores Season X viven en `app/lib/theme.ts`.
