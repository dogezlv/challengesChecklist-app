# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

The actual app lives in the `challenges_checklist/` subdirectory — the repo root only holds this file and a README. **Run all commands from `challenges_checklist/`.**

## Commands

```bash
cd challenges_checklist
npm run dev      # dev server (Turbopack)
npm run build    # production build — also the main type/correctness check
npm run lint     # eslint
```

There is no test suite.

## Next.js 16 warning

This project uses **Next.js 16**, which has breaking changes versus what you may know from training data (see `challenges_checklist/AGENTS.md`). Before writing Next.js-specific code, consult the bundled docs at `challenges_checklist/node_modules/next/dist/docs/`. Note `cookies()` from `next/headers` is async and must be awaited.

## What this app is

A Fortnite-style challenges checklist: users mark challenges complete or track numeric progress; an admin panel manages the underlying data. UI text is in Spanish. Stack: Next.js 16 App Router, React 19, Tailwind 4, Supabase (Postgres + Auth + Realtime), TypeScript with `@/*` path alias mapping to the `challenges_checklist/` root.

## Architecture

All data lives in Supabase; there is no local database or ORM. Client components talk to Supabase directly (no API layer for data), using the clients in `utils/supabase/`:

- `utils/supabase/server.ts` — `createClient(cookieStore)` for Server Components; callers must pass `await cookies()`.
- `utils/supabase/client.ts` — browser client for `"use client"` components.
- `utils/supabase/middleware.ts` — session-refresh helper, currently **not wired up** (there is no root `middleware.ts`).

Env vars in `challenges_checklist/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (used only by the legacy login route), and `SUPABASE_ACCESS_TOKEN` (personal access token, not used by the app).

Direct DB access for development: the service role key works against the REST API (`https://<project>.supabase.co/rest/v1/...`, bypasses RLS), and the access token allows arbitrary SQL including DDL via the Management API: `POST https://api.supabase.com/v1/projects/ucjuxngjmcdwggishima/database/query` with body `{"query": "..."}`. Schema changes (tables, RPCs, RLS policies) can therefore be made directly from here.

### Auth

Two systems coexist:

1. **Supabase Auth (current)** — `app/login/page.tsx` maps a username to a fake email (`<username>@checklist.local`) and calls `signInWithPassword`/`signUp`. `/tracker` and `/admin` gate access with `supabase.auth.getUser()` and redirect to `/login`; the checklist at `/` is **public** (read-only, anon RLS policies + table GRANTs from `db/04`, Realtime updates work for anonymous visitors).
2. **Legacy custom auth** — `app/api/login/route.ts` (bcrypt against a `users` table, sets a `session_user` cookie, uses the service-role key) and `app/api/logout/route.ts`. Predates Supabase Auth; nothing reads the `session_user` cookie.

Admin access (`app/admin/`) additionally requires a row in the `admin_users` table for the logged-in user.

### Supervisor tracking system

The app's purpose: **supervisors** (any authenticated user) track challenge progress for a supervised player. The core flow is the `/tracker` page (`app/tracker/TrackerPanel.tsx`): quick-action chips are generated from the rules of the selected week's incomplete challenges; pressing one + entering an amount calls the `report_event` RPC, which finds ALL matching `challenge_rules` and applies progress respecting `match_scope` (`any_match` / `same_match` / `different_matches`), phase gating (only the lowest incomplete `phase_order` of a `challenge_lines` group advances), and `rule_conditions` (event must include all of a rule's condition keys). Matches are started/ended with `start_match()`/`end_active_match()`, which also reset incomplete `same_match` progress. SQL for all of this lives in `challenges_checklist/db/` (01 = engine, 02 = Season 8 data); run it via the Management API.

`challenges.unit`: `'value'` = amounts are summed (damage, health, materials); `'count'` = each event adds its amount as occurrences; `'distinct_location'` = counts distinct named locations (tracked in `challenge_distinct_progress`; repeating a location does not add). `match_rule_progress` stores per-rule hits: `match_id` null = global accumulator for `any_match` AND-rules; per-match rows enforce once-per-match semantics.

`challenges.is_meta`: one auto-computed "Complete all weekly challenges" row per week. Phase lines (`line_id` groups) count as ONE challenge toward it, done only when every phase is complete; the meta's `target_value` is the week's challenge count (kept up to date by the trigger). The `trg_sync_week_meta` trigger recomputes it whenever any challenge's `is_completed`/`current_value` changes; the manual RPCs and `report_event` refuse to touch meta rows. When seeding a new season, insert its meta rows too (see `db/03_distinct_meta.sql` section 7).

The tracker is a **global panel**: it loads the whole season and builds per-action category cards (weapon/object/location toggles + condition checkmarks, options derived from pending unlocked rules, so they disappear as challenges complete). The amount input only appears for actions with pending `value`-unit challenges. Item icons live in `public/icons/<code>.png` (downloaded from the Fortnite wiki via its MediaWiki API; `FortniteIcon` falls back to emoji), and both pages use Fortnite-style week tab buttons (`WeekTabs`) and mission cards (`MissionCard`).

### Development tips (DB + testing)

- Run SQL via the Management API: write the statement(s) to a file, JSON-encode with python (`json.dump({'query': sql}, ...)`), then `curl -X POST https://api.supabase.com/v1/projects/ucjuxngjmcdwggishima/database/query --data @file`. Only the LAST statement's result is returned — collect multi-step test output into a temp table and select it at the end. Use project-relative paths for files Python reads (`/tmp` is git-bash-only, invisible to native Windows Python).
- To test `report_event`/`start_match` from SQL (they require `auth.uid()`), prepend: `select set_config('request.jwt.claims', '{"sub":"<user-uuid>","role":"authenticated"}', false);` in the same request.
- Full progress reset: `delete from challenge_distinct_progress; delete from match_rule_progress; delete from matches; update challenges set current_value = 0, is_completed = false where is_meta = false;` (the meta trigger recomputes the weekly meta rows automatically).
- Adding a future season: insert into `seasons`, its `challenge_weeks`, one `is_meta` challenge per week (see `db/03_distinct_meta.sql` §7), then the challenges/rules following the `db/02_season8.sql` pg_temp-helper pattern. The UI picks up new seasons/weeks automatically.
- Icon substitutions to be aware of: `volcano_vent` uses the "Air Vent" device icon; `vehicle` uses the Quadcrasher icon, `the_baller` the proper Baller vehicle PNG, and `treasure_map_knife`/`treasure_map_magnify` share the generic "Loading Screen" icon. To replace an icon: resolve the file with the MediaWiki API (`fortnite.fandom.com/api.php?action=query&titles=File:<name>&prop=imageinfo&iiprop=url`, browser User-Agent required; direct `Special:FilePath` returns 403) and save to `public/icons/<code>.png`.
- On Windows, killing `npm run dev` can orphan the Node child holding port 3000; find it with `netstat -ano | grep :3000` and `taskkill //PID <pid> //F`.

Season/week navigation: both `/` and `/tracker` take `?season=<code>&week=<n>` (helper: `app/lib/selection.ts`, picker: `app/components/SeasonWeekPicker.tsx`); defaults to the latest season's week 1.

### Data model (Supabase tables)

- `challenges` — the core table. `kind` is `'simple'` (toggle) or `'progress'` (numeric `current_value`/`target_value`). Optional `line_id` + `phase_order` group challenges into sequential phases of a `challenge_lines` row. `match_scope` is `any_match` / `same_match` / `different_matches`.
- Rules system for auto-tracking: `challenge_rules` links a challenge to an `action_types` row plus optional `game_objects`, `tags`, and `locations` constraints (required vs. target object/tag). `game_object_tags` is the object↔tag join table. Progress challenges have a `rules_operator` (`and`/`or`).
- Manual writes from the tracker's week view go through **Postgres RPC functions**, not direct table updates: `toggle_challenge_completion`, `increase_challenge_progress`, `update_challenge_progress`, `reset_challenge_progress` (current versions in `db/05`). They require an authenticated user; for `same_match`/`different_matches` challenges an active match is required only to ADD progress — removing progress (slider down, untoggle, reset) is always allowed and clears the challenge's `match_rule_progress`/`challenge_distinct_progress` accumulators when it reaches 0.
- Multi-location challenges are modeled as one rule per location: the 7 pirate camps and 3 giant faces are separate `locations` rows (`pirate_camp_*`, `giant_face_*`, `named_location=false`); "visit all X" uses `rules_operator='and'` (each rule counts once via the global accumulator), "any X counts" uses `'or'`, and same_match variants count each rule once per match (see `db/05`).
- **Visit/dance rules never use target objects** — anything visited/danced-at is a `locations` row (hot springs, dinosaurs, ice sculptures, wooden rabbit/stone pig/metal llama, per-POI treasure signposts; migrated in `db/06`).
- **Consumables**: `object_effects` (db/06) maps an object + trigger action to a synthetic effect event (apple → `use` triggers `gain` ×5 health, mushroom ×5 shield — Season 8 values). `report_event` fires the effect recursively after the main loop, so registering apple/mushroom consumption under "usar" advances the gain challenges; the tracker moves effect-covered options from the effect category into the trigger category (`effects` prop).
- **Implications** (db/07-08): any non-visit event with a location also fires a synthetic `visit` at that location (kill at a pirate camp counts as visiting it), and `event_implications` rows fire extra events (damage `while_on_zipline` → use zipline; damage `after_volcano_vent` → use volcano vent; damage/kill with a used object → use it). Synthetic events pass no conditions, so condition-gated rules don't false-positive.
- **Phase lines mimic old Fortnite staged challenges** (db/07-08): challenges with `line_id` require an active match to progress, and when a phase completes, `challenges.completed_in_match` records the match — the next phase stays locked (engine + `computeLockedIds`) until `end_active_match()` clears the column. The manual RPCs enforce the same gate.
- **i18n**: `display_name` is the SPANISH (shown) name everywhere; `display_name_en` (on game_objects, tags, locations, action_types, challenge_weeks, seasons) preserves English for future locale switching. Seasons 9/10 exist with `is_locked=true` (non-selectable; `getSeasonWeekSelection` ignores locked seasons); season tab buttons use the wiki loading-screen art in `public/seasons/<code>.png`.
- **Weapon-only conditions**: `tags.is_weapon`/`game_objects.is_weapon` + `rule_conditions.requires_weapon` — distance/manner conditions (50m, headshot, from above/below, zipline, descending) hide in the tracker when the selected used item isn't a normal weapon (pickaxe, vehicles, consumables).
- `undo_rule_event(p_rule_id)` un-presses an option chip (deletes that rule's accumulator row scope-aware and recomputes). Satisfied options (rule already counted and unable to contribute right now) are hidden from category panels; distinct-location challenges stop offering already-visited places.
- UI font: the real Fortnite **Burbank** OTFs live in `public/` and are wired up in `app/layout.tsx` via `next/font/local` as CSS variables. `--font-title` registers two weights — **Burbank Big Condensed Bold** at `700` (the default for headings/buttons/UI labels) and **Burbank Big Condensed Black** at `900` (use `fontWeight: 900` for a heavier title) — always UPPERCASE; **Burbank Small Medium** (`--font-body`) for descriptive/body text. Use the `titleFont`/`bodyFont` helpers from `app/lib/theme.ts`; `globals.css` sets body→body font and all `h1–h6`→title font + uppercase. The **overlay is the exception**: it uses no heading elements and keeps `var(--font-geist-sans)` — the user rejected Burbank there, so don't apply it to the overlay.
- The admin panel (`app/admin/AdminPanel.tsx`) inserts directly into tables and uses `location.reload()` after each mutation.

### Stream overlay (OBS)

`app/overlay/` is a public, session-less page meant to be loaded as an **OBS Browser Source**. `page.tsx` (server) parses query params and renders `Overlay.tsx` (client), which subscribes to Supabase Realtime (`postgres_changes` UPDATE/INSERT on `challenges`) and shows Fortnite-Season-8-style notifications using the `battle_star`/`battle_pass` icons. Three notice types: **progress** (blue, animated bar + counting number from→to via rAF easeOutCubic), **completed** (green), **meta** weekly-all-done (gold). It shows **one at a time in a FIFO queue** (no stacking). Detection compares each Realtime row against a `state` map (value+completed) seeded on load — `current_value` rose ⇒ progress, `is_completed` false→true ⇒ completed/meta; a `shown` map holds each mission's last-displayed value (the bar animates from there). **Coalescing:** at most one *waiting* notice per mission — a new event for a not-yet-shown mission replaces its pending notice with the more advanced state (higher progress, or completed over progress); if that mission is *currently showing*, the new event queues separately and waits its turn. Lifecycle timers (enter/show/leaving/remove) are scheduled once per notice in `pump()` with ids in a ref — don't move them into a render-driven effect or they cancel themselves. Works for anonymous visitors (anon RLS allows SELECT + Realtime on `challenges`). No sound (removed at user request). Params: `?season=<code>`, `?duration=<ms>` (default 6000), `?test=1` (demo of all three types). Font is the app's (`var(--font-geist-sans)`/Arial) — the user rejected Burbank, don't reintroduce it.

### UI patterns

`app/components/ChallengeChecklist.tsx` is the public read-only view: it receives the whole season's challenges from the server and switches weeks client-side (instant, URL synced with `history.replaceState`; only season changes hit the server). It subscribes to Supabase Realtime (`postgres_changes` on `challenges`) and applies each event's row to local state directly (no full-season refetch, so many anonymous stream viewers don't each re-query on every change). For each phase line it shows ONLY the current phase — the lowest-order incomplete one, or the last phase (as completed) once all are done — so superseded phases don't pile up (`currentPhaseIds`). `TrackerPanel` follows the same all-season + client-side-week pattern and holds the manual controls (toggle/slider/increase) with optimistic local updates, calling the RPC and refetching on error; it shows locked phases with a lock icon. Both pages share a `SearchBox` (accent-insensitive, searches the selected week or, via the "Todas las semanas" tab in `WeekTabs`, the whole season) and render challenges through `sortWeekChallenges` (stable order: phase lines anchored at their oldest phase, phases ascending — completing a challenge never moves it). In the tracker's category cards (`deriveCategoryView`), option groups (weapons/targets/locations) always show ALL pending options — one action can advance several challenges at once. Only CONDITIONS filter: a rule's conditions show when its used/location constraints are pressed and its target matches the selection EXACTLY (both empty counts), so "headshot" disappears with a supply drop selected but "50 m" stays when picking a weapon; a condition required by every such rule is auto-checked and disabled. Layout is stability-first: `auto-fill` grids with `alignItems/alignContent: start` and uniform fixed-height chips in `repeat(auto-fill, minmax(170px, 1fr))` grids. In the week view, multi-option challenges (≥2 rules with a distinguishing object/target/location, e.g. the pirate camps) render one chip per rule that calls `report_event` with that rule's constraints; done-state comes from `match_rule_progress` (loaded in the page and on every refetch; scope-aware via `isRuleDone`). Amount inputs hold free text and can be emptied; empty/0 amounts are no-ops. Styling is inline `style` objects, not Tailwind classes, despite Tailwind being installed.

**Visual theme ("Season X / Road Trip"):** the shared palette and style helpers live in `app/lib/theme.ts` (`fnt` palette, `pageMain`/`contentWrap`/`panel`/`banner`, `navTab`/`pillTab`, `yellowButton`/`blueButton`, `progressTrack`/`progressFill`). The bright-blue radial background (`pageBackground`), top nav (`app/components/TopNav.tsx`), Battle-Pass header banner (`app/components/BattlePassBanner.tsx`), reward-tier strip (`app/components/RewardStrip.tsx`, decorative star/XP tiles tied to week completion + "completa cualquier objetivo…" subtitle), and horizontal Road-Trip-style challenge rows (`MissionCard`) all derive from it. All four pages (`/`, `/tracker`, `/login`, `/admin`) use this theme; the overlay was left untouched. The previous dark-blue look is archived in `challenges_checklist/docs/aesthetic-backup-darkblue.md` for restoration.

**Responsive / fluid sizing:** `fs(min, max)` in `theme.ts` returns a `clamp()` string that scales linearly with viewport width (min at ~380px phone → max at ~3000px/4K), so text/spacing don't look tiny on 4K nor overflow on phones. Use it for `fontSize`/`padding`/dimensions instead of fixed px on prominent surfaces. `contentWrap` is `width: min(1640px, 94vw)` with fluid padding. The font helpers (`navTab`/`pillTab`/`yellowButton`/`blueButton`), banner, reward strip, mission rows, nav, season tabs and page headers already use `fs()`.
