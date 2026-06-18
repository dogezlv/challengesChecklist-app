"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import FortniteIcon from "../components/FortniteIcon";
import LogoutButton from "../components/LogoutButton";
import MissionCard from "../components/MissionCard";
import SearchBox from "../components/SearchBox";
import WeekTabs from "../components/WeekTabs";
import TopNav from "../components/TopNav";
import { contentWrap, fnt, fs, pageMain, titleFont, yellowButton } from "../lib/theme";
import type { Season, Week } from "../lib/selection";
import {
  ACTION_EMOJI,
  CHALLENGE_SELECT,
  SCOPE_LABEL,
  computeLockedIds,
  normalizeText,
  sortWeekChallenges,
  type Challenge,
  type LineRow,
  type LocationRow,
  type Match,
  type Named,
  type Rule,
} from "../lib/types";

// fila de match_rule_progress para marcar qué parte de un desafío
// multi-opción ya está registrada
type RuleProgressRow = { challenge_rule_id: string; match_id: string | null };

// fila de challenge_distinct_progress: lugares ya contados por un desafío
// de "lugares con nombre diferentes"
type DistinctRow = {
  challenge_id: string;
  location_id: string;
  match_id: string | null;
};

// consumible con efecto: usarlo (trigger) dispara un evento sintético
// (effect) con su valor por unidad (manzana → gain 5 de vida)
type EffectRow = {
  trigger_action: string;
  effect_action: string;
  amount_per_use: number;
  object: Named | null;
};

type Option = {
  key: string; // "tag:<id>" | "obj:<id>"
  id: string;
  iconCode: string;
  label: string;
  isWeapon: boolean;
};

type Selection = {
  used: string | null;
  target: string | null;
  loc: string | null;
  conds: string[];
  amount: string; // texto libre: puede quedar vacío o en 0 sin registrar nada
};

// Regla pendiente "aplanada" para el filtrado cruzado de opciones
type PendingRule = {
  usedKey: string | null;
  usedOption: Option | null;
  targetKey: string | null;
  targetOption: Option | null;
  locId: string | null;
  locLabel: string | null;
  conds: { key: string; label: string; requiresWeapon: boolean }[];
  distinct: boolean; // el desafío cuenta lugares con nombre diferentes
  distinctVisited?: Set<string>; // lugares que ese desafío ya contó
};

type Category = {
  actionCode: string;
  actionName: string;
  rules: PendingRule[];
  hasValue: boolean; // alguna regla pendiente pertenece a un desafío de cantidad
  pendingCount: number;
};

type CondOption = { key: string; label: string; auto: boolean };

// resultado de report_event (o error local) que se muestra bajo cada categoría
type ReportUpdated = {
  id: string;
  description: string;
  current_value: number;
  target_value: number;
  is_completed: boolean;
};
type ReportSkipped = { id: string; description: string; reason: string };
type ReportResult = {
  error?: string;
  updated?: ReportUpdated[];
  skipped?: ReportSkipped[];
};

type CategoryView = {
  usedOptions: Option[];
  targetOptions: Option[];
  locationOptions: { id: string; label: string }[];
  condOptions: CondOption[];
};

const EMPTY_SELECTION: Selection = {
  used: null,
  target: null,
  loc: null,
  conds: [],
  amount: "", // vacío por defecto: sin valor = 1 (salvo desafíos de cantidad)
};

// Las opciones (armas/objetivos/lugares) se muestran SIEMPRE todas: una sola
// acción puede avanzar varios desafíos a la vez (arma X + lugar Y + condición
// Z). Solo las CONDICIONES se filtran, porque hay combinaciones sin sentido:
//   - condición de regla con arma/lugar exigido → solo con esa opción presionada
//   - condición sobre el objetivo → solo si el objetivo coincide EXACTO
//     (con "entrega de suministros" elegida desaparece "disparo a la cabeza",
//     pero "a 50 m" sigue disponible al elegir un arma).
function deriveCategoryView(
  cat: Category,
  sel: Selection,
  namedLocations: { id: string; label: string }[]
): CategoryView {
  const used = new Map<string, Option>();
  const target = new Map<string, Option>();
  const locs = new Map<string, { id: string; label: string }>();
  for (const r of cat.rules) {
    if (r.usedOption) used.set(r.usedKey!, r.usedOption);
    if (r.targetOption) target.set(r.targetKey!, r.targetOption);
    if (r.locId) locs.set(r.locId, { id: r.locId, label: r.locLabel! });
    else if (r.distinct)
      // lugares ya contados por ese desafío no se vuelven a ofrecer
      for (const l of namedLocations)
        if (!r.distinctVisited?.has(l.id)) locs.set(l.id, l);
  }

  // ¿lo seleccionado como "usado" es un arma normal? (las condiciones de
  // distancia/manera no aplican a picos, vehículos, consumibles…)
  const selUsedIsWeapon = sel.used
    ? cat.rules.some((r) => r.usedKey === sel.used && r.usedOption?.isWeapon)
    : false;

  // reglas cuyas condiciones siguen teniendo sentido con la selección actual
  const covered = cat.rules.filter(
    (r) =>
      // arma/objeto exigido por la regla: debe estar presionado
      (!r.usedKey || sel.used === r.usedKey) &&
      // objetivo: coincidencia exacta (ambos vacíos también vale)
      r.targetKey === sel.target &&
      // lugar exigido por la regla: debe estar presionado
      (!r.locId || sel.loc === r.locId)
  );
  const condMap = new Map<string, string>();
  for (const r of covered)
    for (const c of r.conds) {
      if (c.requiresWeapon && sel.used && !selUsedIsWeapon) continue;
      condMap.set(c.key, c.label);
    }

  // auto: si TODAS las reglas cubiertas exigen la condición, es única en
  // este contexto y viene marcada sola
  const condOptions: CondOption[] = [...condMap.entries()].map(
    ([key, label]) => ({
      key,
      label,
      auto:
        covered.length > 0 &&
        covered.every((r) => r.conds.some((c) => c.key === key)),
    })
  );

  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label);
  return {
    usedOptions: [...used.values()].sort(byLabel),
    targetOptions: [...target.values()].sort(byLabel),
    locationOptions: [...locs.values()].sort(byLabel),
    condOptions,
  };
}

// acciones donde una "cantidad" no tiene sentido (se visita/baila/aterriza
// una vez por registro)
const NO_AMOUNT_ACTIONS = ["visit", "dance", "land", "misc"];

const CATEGORY_ORDER = [
  "kill",
  "damage",
  "search",
  "use",
  "visit",
  "land",
  "gain",
  "harvest",
  "dance",
  "destroy",
  "outlast",
  "revive",
  "misc",
];

export default function TrackerPanel({
  seasons,
  weeks,
  seasonCode,
  initialWeekNumber,
  initialChallenges,
  lines,
  actionTypes,
  locations,
  initialActiveMatch,
  initialRuleProgress,
  initialDistinctProgress,
  effects,
  isAdmin,
}: {
  seasons: Season[];
  weeks: Week[];
  seasonCode: string;
  initialWeekNumber: number;
  initialChallenges: Challenge[];
  lines: LineRow[];
  actionTypes: Named[];
  locations: LocationRow[];
  initialActiveMatch: Match | null;
  initialRuleProgress: RuleProgressRow[];
  initialDistinctProgress: DistinctRow[];
  effects: EffectRow[];
  isAdmin: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [ruleProgress, setRuleProgress] =
    useState<RuleProgressRow[]>(initialRuleProgress);
  const [distinctProgress, setDistinctProgress] = useState<DistinctRow[]>(
    initialDistinctProgress
  );
  const [activeMatch, setActiveMatch] = useState<Match | null>(initialActiveMatch);
  const [weekTab, setWeekTab] = useState<number>(initialWeekNumber);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [results, setResults] = useState<Record<string, ReportResult>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  // re-sincroniza cuando el servidor manda otra temporada (ajuste de estado
  // durante el render comparando la prop anterior, sin efecto)
  const [prevInitial, setPrevInitial] = useState(initialChallenges);
  if (prevInitial !== initialChallenges) {
    setPrevInitial(initialChallenges);
    setChallenges(initialChallenges);
  }

  const weekIds = useMemo(() => weeks.map((w) => w.id), [weeks]);

  async function loadChallenges() {
    if (!weekIds.length) return;
    const [challengesRes, progressRes, distinctRes] = await Promise.all([
      supabase
        .from("challenges")
        .select(CHALLENGE_SELECT)
        .in("week_id", weekIds)
        .order("created_at", { ascending: true }),
      supabase.from("match_rule_progress").select("challenge_rule_id, match_id"),
      supabase
        .from("challenge_distinct_progress")
        .select("challenge_id, location_id, match_id"),
    ]);
    if (!challengesRes.error && challengesRes.data)
      setChallenges(challengesRes.data as unknown as Challenge[]);
    if (!progressRes.error && progressRes.data)
      setRuleProgress(progressRes.data as RuleProgressRow[]);
    if (!distinctRes.error && distinctRes.data)
      setDistinctProgress(distinctRes.data as DistinctRow[]);
  }

  async function loadMatch() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    setActiveMatch((data as Match) ?? null);
  }

  useEffect(() => {
    const channel = supabase
      .channel("tracker-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        () => loadChallenges()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => loadMatch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIds.join(",")]);

  const lockedIds = useMemo(() => computeLockedIds(challenges), [challenges]);

  const namedLocations = useMemo(
    () =>
      locations
        .filter((l) => l.named_location)
        .map((l) => ({ id: l.id, label: l.display_name })),
    [locations]
  );
  const namedLocIds = useMemo(
    () => new Set(namedLocations.map((l) => l.id)),
    [namedLocations]
  );

  // Misiones misceláneas pendientes (acción "misc"): su sección no muestra
  // chips/condiciones, sino la misión completa con un botón para completarla.
  const miscChallenges = useMemo(
    () =>
      challenges.filter(
        (c) =>
          !c.is_completed &&
          !c.is_meta &&
          !lockedIds.has(c.id) &&
          (c.challenge_rules ?? []).some((r) => r.action_type?.code === "misc")
      ),
    [challenges, lockedIds]
  );

  // Categorías del panel global: reglas pendientes de TODA la temporada,
  // aplanadas para el filtrado cruzado. Cuando un desafío se completa, sus
  // opciones y condiciones desaparecen solas.
  const categories = useMemo<Category[]>(() => {
    type Acc = {
      rules: PendingRule[];
      hasValue: boolean;
      pending: Set<string>;
    };
    const byAction = new Map<string, Acc>();

    const toOption = (kind: "obj" | "tag", o: Named): Option => ({
      key: `${kind}:${o.id}`,
      id: o.id,
      iconCode: o.code,
      label: o.display_name,
      isWeapon: o.is_weapon ?? false,
    });

    const getAcc = (code: string): Acc => {
      let acc = byAction.get(code);
      if (!acc) {
        acc = { rules: [], hasValue: false, pending: new Set() };
        byAction.set(code, acc);
      }
      return acc;
    };

    for (const c of challenges) {
      if (c.is_completed || c.is_meta || lockedIds.has(c.id)) continue;
      const totalRules = c.challenge_rules?.length ?? 0;

      for (const r of c.challenge_rules ?? []) {
        const code = r.action_type?.code;
        if (!code) continue;

        // opción ya satisfecha (registrada y sin posibilidad de aportar más
        // ahora mismo): no se ofrece, solo estorbaría al supervisor
        let satisfied = false;
        if (
          c.match_scope === "any_match" &&
          c.rules_operator === "and" &&
          totalRules > 1
        ) {
          satisfied = ruleProgress.some(
            (p) => p.challenge_rule_id === r.id && p.match_id === null
          );
        } else if (
          (c.match_scope === "same_match" && totalRules > 1) ||
          c.match_scope === "different_matches"
        ) {
          satisfied =
            !!activeMatch &&
            ruleProgress.some(
              (p) =>
                p.challenge_rule_id === r.id && p.match_id === activeMatch.id
            );
        }
        if (satisfied) continue;

        // consumibles: el desafío (p. ej. "gana salud con manzanas") se
        // registra consumiendo el objeto en su acción trigger ("usar"),
        // no directamente en la categoría del efecto
        const consumable = effects.find(
          (e) =>
            e.effect_action === code &&
            e.object &&
            r.required_object?.id === e.object.id
        );
        if (consumable) {
          const accUse = getAcc(consumable.trigger_action);
          accUse.pending.add(c.id);
          accUse.rules.push({
            usedKey: `obj:${consumable.object!.id}`,
            usedOption: toOption("obj", consumable.object!),
            targetKey: null,
            targetOption: null,
            locId: null,
            locLabel: null,
            conds: [],
            distinct: false,
          });
          continue;
        }

        const acc = getAcc(code);
        acc.pending.add(c.id);
        if (c.unit === "value") acc.hasValue = true;

        const usedOption = r.required_object
          ? toOption("obj", r.required_object)
          : r.required_tag
            ? toOption("tag", r.required_tag)
            : null;
        const targetOption = r.target_object
          ? toOption("obj", r.target_object)
          : r.target_tag
            ? toOption("tag", r.target_tag)
            : null;

        const distinct = c.unit === "distinct_location";
        acc.rules.push({
          usedKey: usedOption?.key ?? null,
          usedOption,
          targetKey: targetOption?.key ?? null,
          targetOption,
          locId: r.location?.id ?? null,
          locLabel: r.location?.display_name ?? null,
          conds: r.rule_conditions.map((rc) => ({
            key: rc.condition_key,
            label: rc.condition_value,
            requiresWeapon: rc.requires_weapon ?? false,
          })),
          distinct,
          distinctVisited: distinct
            ? new Set(
                distinctProgress
                  .filter(
                    (d) =>
                      d.challenge_id === c.id &&
                      (c.match_scope === "same_match"
                        ? d.match_id === (activeMatch?.id ?? "__none__")
                        : d.match_id === null)
                  )
                  .map((d) => d.location_id)
              )
            : undefined,
        });
      }
    }

    const list: Category[] = [];
    for (const [code, acc] of byAction) {
      list.push({
        actionCode: code,
        actionName:
          actionTypes.find((a) => a.code === code)?.display_name ?? code,
        rules: acc.rules,
        hasValue: acc.hasValue,
        pendingCount: acc.pending.size,
      });
    }

    list.sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.actionCode) -
        CATEGORY_ORDER.indexOf(b.actionCode)
    );
    return list;
  }, [
    challenges,
    lockedIds,
    actionTypes,
    effects,
    ruleProgress,
    distinctProgress,
    activeMatch,
  ]);

  function getSelection(action: string): Selection {
    return selections[action] ?? EMPTY_SELECTION;
  }

  function patchSelection(action: string, patch: Partial<Selection>) {
    setSelections((prev) => ({
      ...prev,
      [action]: { ...getSelection(action), ...patch },
    }));
  }

  function toggleSingle(
    action: string,
    field: "used" | "target" | "loc",
    value: string
  ) {
    const cur = getSelection(action)[field];
    patchSelection(action, { [field]: cur === value ? null : value });
  }

  async function register(cat: Category) {
    const sel = getSelection(cat.actionCode);
    const parse = (key: string | null) => ({
      obj: key?.startsWith("obj:") ? key.slice(4) : null,
      tag: key?.startsWith("tag:") ? key.slice(4) : null,
    });
    const used = parse(sel.used);
    const target = parse(sel.target);

    // cantidad: vacía = 1 evento; con 0 o negativa no registra nada; en
    // desafíos de cantidad (vida, daño, materiales…) es obligatoria
    let amount = 1;
    const raw = sel.amount.trim();
    if (raw !== "") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setResults((prev) => ({
          ...prev,
          [cat.actionCode]: {
            error: "Pon una cantidad mayor que 0 para registrar.",
          },
        }));
        return;
      }
      amount = Math.floor(parsed);
    } else if (cat.hasValue) {
      setResults((prev) => ({
        ...prev,
        [cat.actionCode]: {
          error: "Esta acción necesita una cantidad (vida, daño, materiales…).",
        },
      }));
      return;
    }

    // solo se envían condiciones que aplican a la selección actual; las
    // automáticas (únicas en este contexto) van incluidas siempre
    const view = deriveCategoryView(cat, sel, namedLocations);
    const conds = new Set(
      sel.conds.filter((k) => view.condOptions.some((c) => c.key === k))
    );
    for (const c of view.condOptions) if (c.auto) conds.add(c.key);

    setBusyAction(cat.actionCode);
    const { data, error } = await supabase.rpc("report_event", {
      p_action_code: cat.actionCode,
      p_amount: amount,
      p_used_object_id: used.obj,
      p_used_tag_id: used.tag,
      p_target_object_id: target.obj,
      p_target_tag_id: target.tag,
      p_location_id: sel.loc,
      p_conditions: [...conds],
    });
    setBusyAction(null);

    setResults((prev) => ({
      ...prev,
      [cat.actionCode]: error
        ? { error: error.message }
        : ((data ?? {}) as ReportResult),
    }));
    if (!error) loadChallenges();
  }

  async function startMatch() {
    const { error } = await supabase.rpc("start_match");
    if (error) alert(error.message);
    loadMatch();
    loadChallenges();
  }

  async function endMatch() {
    const { error } = await supabase.rpc("end_active_match");
    if (error) alert(error.message);
    loadMatch();
    loadChallenges();
  }

  // solo admin: borra TODO el progreso de misiones y todas las partidas
  async function resetAll() {
    setResetting(true);
    const { error } = await supabase.rpc("reset_all_progress");
    setResetting(false);
    setConfirmReset(false);
    if (error) alert(error.message);
    loadMatch();
    loadChallenges();
  }

  // ---- controles manuales (antes en la checklist pública) ----
  async function toggleSimpleChallenge(challenge: Challenge) {
    setChallenges((prev) =>
      prev.map((c) =>
        c.id === challenge.id
          ? {
              ...c,
              is_completed: !c.is_completed,
              current_value: c.is_completed ? 0 : (c.target_value ?? 1),
            }
          : c
      )
    );

    const { error } = await supabase.rpc("toggle_challenge_completion", {
      p_challenge_id: challenge.id,
    });

    if (error) {
      alert(error.message);
    }
    loadChallenges();
  }

  // "descompletar / quitar progreso": pone 0 y limpia acumuladores;
  // no necesita partida activa
  async function resetProgress(challenge: Challenge) {
    setChallenges((prev) =>
      prev.map((c) =>
        c.id === challenge.id
          ? { ...c, is_completed: false, current_value: 0 }
          : c
      )
    );

    const { error } = await supabase.rpc("reset_challenge_progress", {
      p_challenge_id: challenge.id,
    });

    if (error) alert(error.message);
    loadChallenges();
  }

  // ---- desafíos multi-opción: un botón por objetivo/objeto/lugar ----

  // etiqueta que distingue cada opción dentro del desafío
  function ruleLabel(r: Rule): string | null {
    const parts = [
      r.required_object?.display_name ?? r.required_tag?.display_name,
      r.target_object?.display_name ?? r.target_tag?.display_name,
      r.location?.display_name,
    ].filter((p): p is string => !!p);
    if (!parts.length && r.rule_conditions.length)
      return r.rule_conditions.map((c) => c.condition_value).join(" · ");
    return parts.length ? parts.join(" · ") : null;
  }

  // ¿esta opción ya quedó registrada? (acumulador global para any_match;
  // por partida activa para same_match; cualquier partida para different)
  function isRuleDone(c: Challenge, ruleId: string): boolean {
    if (c.match_scope === "same_match") {
      return (
        !!activeMatch &&
        ruleProgress.some(
          (p) => p.challenge_rule_id === ruleId && p.match_id === activeMatch.id
        )
      );
    }
    if (c.match_scope === "different_matches") {
      return ruleProgress.some(
        (p) => p.challenge_rule_id === ruleId && p.match_id !== null
      );
    }
    return ruleProgress.some(
      (p) => p.challenge_rule_id === ruleId && p.match_id === null
    );
  }

  async function registerRule(c: Challenge, r: Rule) {
    if (!r.action_type) return;
    setBusyRule(r.id);
    const { data, error } = await supabase.rpc("report_event", {
      p_action_code: r.action_type.code,
      p_amount: 1,
      p_used_object_id: r.required_object?.id ?? null,
      p_used_tag_id: r.required_tag?.id ?? null,
      p_target_object_id: r.target_object?.id ?? null,
      p_target_tag_id: r.target_tag?.id ?? null,
      p_location_id: r.location?.id ?? null,
      p_conditions: r.rule_conditions.map((rc) => rc.condition_key),
    });
    setBusyRule(null);

    if (error) {
      alert(error.message);
    } else {
      const res = data as {
        updated?: unknown[];
        skipped?: { reason?: string }[];
      } | null;
      if (res?.skipped?.length && !res?.updated?.length) {
        alert(
          res.skipped[0].reason === "no_active_match"
            ? "Requiere una partida activa"
            : "No aplicó: requiere un lugar con nombre"
        );
      }
    }
    loadChallenges();
  }

  // despresionar una opción ya registrada: quita ese registro y recalcula
  async function undoRule(r: Rule) {
    setBusyRule(r.id);
    const { error } = await supabase.rpc("undo_rule_event", {
      p_rule_id: r.id,
    });
    setBusyRule(null);
    if (error) alert(error.message);
    loadChallenges();
  }

  async function increaseProgress(challenge: Challenge, amount: number) {
    const { error } = await supabase.rpc("increase_challenge_progress", {
      p_challenge_id: challenge.id,
      p_increase_value: amount,
    });

    if (error) alert(error.message);
    loadChallenges();
  }

  async function setProgress(challenge: Challenge, newValue: number) {
    const { error } = await supabase.rpc("update_challenge_progress", {
      p_challenge_id: challenge.id,
      p_current_value: newValue,
    });

    if (error) alert(error.message);
    loadChallenges();
  }

  // ---- vista por semana (overview) ----
  const tabWeek = weeks.find((w) => w.week_number === weekTab) ?? weeks[0];
  const viewWeeks = showAll ? weeks : tabWeek ? [tabWeek] : [];
  const query = normalizeText(search.trim());

  // en el panel se ven TODAS las fases (las bloqueadas con candado), siempre
  // en orden ascendente y sin moverse de sitio al completarse
  function weekItems(week: Week) {
    return sortWeekChallenges(
      challenges.filter((c) => c.week_id === week.id && !c.is_meta)
    ).filter((c) => !query || normalizeText(c.description).includes(query));
  }

  function weekMetaOf(week: Week) {
    const meta = challenges.find((c) => c.week_id === week.id && c.is_meta);
    if (!meta) return null;
    if (query && !normalizeText(meta.description).includes(query)) return null;
    return meta;
  }

  function lineName(lineId: string | null) {
    if (!lineId) return null;
    const name = lines.find((l) => l.id === lineId)?.name;
    if (!name) return null;
    return name.split(" — ")[1] ?? name;
  }

  // ---- estilos ----
  const card: React.CSSProperties = {
    background: fnt.panel,
    border: `1px solid ${fnt.border}`,
    borderRadius: 12,
    padding: 18,
    color: "white",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
  };
  const button: React.CSSProperties = {
    ...yellowButton,
    padding: `${fs(9, 14)} ${fs(14, 24)}`,
    borderRadius: 6,
    fontSize: fs(14, 21),
  };
  // chips uniformes: todos miden lo mismo dentro de una cuadrícula fija,
  // así el panel no cambia de tamaño ni baila al (de)seleccionar
  const chipGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
    gap: 8,
  };
  const toggleBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    minHeight: 40,
    height: "100%", // ocupa toda la celda: la fila crece si un texto es largo
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${fnt.borderSoft}`,
    background: "rgba(8, 40, 86, 0.5)",
    color: fnt.textDim,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.25,
    width: "100%",
    minWidth: 0,
    whiteSpace: "normal", // el texto largo se expande hacia abajo, no se corta
    textAlign: "left",
  };
  const subLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: fnt.textMuted,
  };
  const toggleOn: React.CSSProperties = {
    ...toggleBase,
    background: "linear-gradient(180deg, #eaf7ff 0%, #9fd4ff 100%)",
    border: "1px solid #bfe6ff",
    color: "#0a3e85",
    fontWeight: 800,
  };
  const groupLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#bfe6ff",
  };

  // ---- helpers de chips: subgrupos con texto y separador SOLO cuando
  // conviven los dos tipos (genérico/específico, con nombre/sin nombre) ----
  function chipSections(
    sections: { label: string; chips: React.ReactNode[] }[]
  ) {
    const present = sections.filter((s) => s.chips.length > 0);
    return present.map((s, i) => (
      <div
        key={s.label}
        style={{
          display: "grid",
          gap: 6,
          ...(i > 0 ? { borderTop: "1px solid #1e2c47", paddingTop: 8 } : {}),
        }}
      >
        {present.length > 1 && <span style={subLabel}>{s.label}</span>}
        <div style={chipGrid}>{s.chips}</div>
      </div>
    ));
  }

  function optionChip(
    cat: Category,
    sel: Selection,
    field: "used" | "target",
    o: Option,
    emoji: string
  ) {
    return (
      <button
        key={o.key}
        style={sel[field] === o.key ? toggleOn : toggleBase}
        onClick={() => toggleSingle(cat.actionCode, field, o.key)}
      >
        <FortniteIcon code={o.iconCode} emoji={emoji} size={22} />
        {o.label}
      </button>
    );
  }

  function locationChip(
    cat: Category,
    sel: Selection,
    l: { id: string; label: string }
  ) {
    return (
      <button
        key={l.id}
        style={sel.loc === l.id ? toggleOn : toggleBase}
        onClick={() => toggleSingle(cat.actionCode, "loc", l.id)}
      >
        📍 {l.label}
      </button>
    );
  }

  const navTabs = [
    { label: "Misiones", href: "/" },
    { label: "Panel", href: "/tracker", active: true },
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
  ];

  return (
    <main style={pageMain}>
      <div style={contentWrap}>
      {/* Barra de navegación */}
      <TopNav
        tabs={navTabs}
        right={
          <>
            {isAdmin &&
              (confirmReset ? (
                <>
                  <button
                    onClick={resetAll}
                    disabled={resetting}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "none",
                      background: fnt.red,
                      color: "white",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: resetting ? "not-allowed" : "pointer",
                      opacity: resetting ? 0.6 : 1,
                    }}
                  >
                    {resetting ? "Reiniciando…" : "¿Seguro? Reiniciar todo"}
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    disabled={resetting}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: fnt.textDim,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 6,
                    background: "linear-gradient(180deg, #e1493a 0%, #b3271a 100%)",
                    border: "none",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Reiniciar todo
                </button>
              ))}
            <LogoutButton />
          </>
        }
      />

      {/* Título */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <FortniteIcon code="week_banner" emoji="🗒️" size={48} />
        <div>
          <h1
            style={{
              fontFamily: titleFont,
              color: "white",
              fontSize: fs(32, 62),
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            Panel de supervisión
          </h1>
          <span style={{ color: fnt.textDim, fontSize: fs(13, 20) }}>
            Registro global de eventos · toda la temporada
          </span>
        </div>
      </header>

      {/* Control de partida: viaja fijo arriba dentro de una FRANJA a todo el
          ancho de la página (márgenes negativos anulan el padding del main),
          con fondo translúcido + blur y aire abajo, para que al hacer scroll
          el contenido pase por detrás de una banda limpia y no se vea colarse
          por los lados de la tarjeta */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          margin: "0 -26px 18px",
          padding: "16px 26px 22px",
          background: "rgba(5, 30, 66, 0.9)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: `3px solid ${fnt.border}`,
          boxShadow: "0 10px 24px rgba(0, 0, 0, 0.4)",
        }}
      >
      <section
        style={{
          ...card,
          background:
            "linear-gradient(120deg, rgba(16,70,140,0.85) 0%, rgba(20,100,120,0.8) 100%)",
          border: activeMatch
            ? `1px solid ${fnt.green}`
            : `1px solid ${fnt.border}`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          boxShadow: activeMatch
            ? "0 0 14px rgba(52, 211, 153, 0.35)"
            : "0 0 14px rgba(124, 202, 250, 0.3)",
        }}
      >
        {activeMatch ? (
          <>
            <span style={{ fontWeight: 700 }}>
              🟢 Partida activa desde{" "}
              {new Date(activeMatch.started_at).toLocaleTimeString()}
            </span>
            <button
              onClick={endMatch}
              style={{
                ...button,
                background: "linear-gradient(180deg, #f87171 0%, #b91c1c 100%)",
              }}
            >
              Terminar partida
            </button>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 700 }}>⚪ Sin partida activa</span>
            <button
              onClick={startMatch}
              style={{
                ...button,
                background: "linear-gradient(180deg, #7ef5a8 0%, #15803d 100%)",
              }}
            >
              Iniciar partida
            </button>
          </>
        )}
        <span style={{ color: "#9fc9f5", fontSize: 13 }}>
          Los desafíos de &quot;misma partida&quot; y &quot;partidas
          diferentes&quot; requieren partida activa.
        </span>
      </section>
      </div>

      {/* Panel global por categorías: auto-fill + alineado arriba para que
          las tarjetas conserven su ancho y solo se "recorran" hacia arriba */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
          alignItems: "start",
          gap: 16,
          marginBottom: 26,
        }}
      >
        {categories.map((cat) => {
          const sel = getSelection(cat.actionCode);
          const res = results[cat.actionCode];
          const view = deriveCategoryView(cat, sel, namedLocations);
          return (
            <section
              key={cat.actionCode}
              style={{ ...card, display: "grid", gap: 12, alignContent: "start" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2
                  style={{
                    fontFamily: titleFont,
                    margin: 0,
                    fontSize: fs(20, 36),
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    fontWeight: 700,
                  }}
                >
                  {ACTION_EMOJI[cat.actionCode] ?? "▶️"} {cat.actionName}
                </h2>
                <span style={{ color: "#7ccafa", fontSize: 12, fontWeight: 700 }}>
                  {cat.pendingCount} desafíos pendientes
                </span>
              </div>

              {cat.actionCode === "misc" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {miscChallenges.map((c) => {
                    const r = (c.challenge_rules ?? []).find(
                      (x) => x.action_type?.code === "misc"
                    );
                    if (!r) return null;
                    const blocked =
                      (c.match_scope !== "any_match" || !!c.line_id) &&
                      !activeMatch;
                    return (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #2c4a7c",
                          background: "#10254a",
                        }}
                      >
                        <span style={{ fontSize: 13, lineHeight: 1.3 }}>
                          {c.description}
                        </span>
                        <div
                          style={{
                            display: "grid",
                            gap: 4,
                            justifyItems: "end",
                            flexShrink: 0,
                          }}
                        >
                          <button
                            disabled={busyRule === r.id || blocked}
                            onClick={() => registerRule(c, r)}
                            style={{
                              ...button,
                              opacity: busyRule === r.id || blocked ? 0.5 : 1,
                              cursor:
                                busyRule === r.id || blocked
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {busyRule === r.id ? "…" : "Completar"}
                          </button>
                          {blocked && (
                            <span
                              style={{
                                color: "#fbbf24",
                                fontSize: 11,
                                textAlign: "right",
                              }}
                            >
                              ⚠ Requiere partida activa
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {miscChallenges.length === 0 && (
                    <span style={{ color: "#9fc9f5", fontSize: 13 }}>
                      No quedan misiones misceláneas.
                    </span>
                  )}
                </div>
              ) : (
              <>

              {view.usedOptions.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={groupLabel}>Arma / objeto usado</span>
                  {chipSections([
                    {
                      label: "Genéricos (tipo)",
                      chips: view.usedOptions
                        .filter((o) => o.key.startsWith("tag:"))
                        .map((o) => optionChip(cat, sel, "used", o, "🔹")),
                    },
                    {
                      label: "Específicos",
                      chips: view.usedOptions
                        .filter((o) => o.key.startsWith("obj:"))
                        .map((o) => optionChip(cat, sel, "used", o, "🔹")),
                    },
                  ])}
                </div>
              )}

              {view.targetOptions.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={groupLabel}>Objetivo</span>
                  {chipSections([
                    {
                      label: "Genéricos (tipo)",
                      chips: view.targetOptions
                        .filter((o) => o.key.startsWith("tag:"))
                        .map((o) => optionChip(cat, sel, "target", o, "🎯")),
                    },
                    {
                      label: "Específicos",
                      chips: view.targetOptions
                        .filter((o) => o.key.startsWith("obj:"))
                        .map((o) => optionChip(cat, sel, "target", o, "🎯")),
                    },
                  ])}
                </div>
              )}

              {view.locationOptions.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={groupLabel}>Lugar</span>
                  {chipSections([
                    {
                      label: "Lugares con nombre",
                      chips: view.locationOptions
                        .filter((l) => namedLocIds.has(l.id))
                        .map((l) => locationChip(cat, sel, l)),
                    },
                    {
                      label: "Otros lugares",
                      chips: view.locationOptions
                        .filter((l) => !namedLocIds.has(l.id))
                        .map((l) => locationChip(cat, sel, l)),
                    },
                  ])}
                </div>
              )}

              {view.condOptions.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={groupLabel}>Condiciones especiales</span>
                  <div style={{ display: "grid", gap: 4 }}>
                    {view.condOptions.map((c) => (
                      <label
                        key={c.key}
                        style={{
                          fontSize: 13,
                          color: c.auto ? "#7ef5a8" : "#cfe6ff",
                          cursor: c.auto ? "default" : "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={c.auto || sel.conds.includes(c.key)}
                          disabled={c.auto}
                          onChange={(e) =>
                            patchSelection(cat.actionCode, {
                              conds: e.target.checked
                                ? [...sel.conds, c.key]
                                : sel.conds.filter((k) => k !== c.key),
                            })
                          }
                          style={{ marginRight: 8 }}
                        />
                        ✔ {c.label}
                        {c.auto && (
                          <span style={{ color: "#9fc9f5", fontSize: 11 }}>
                            {" "}
                            (incluida automáticamente)
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderTop: "1px solid #1e2c47",
                  paddingTop: 12,
                }}
              >
                {!NO_AMOUNT_ACTIONS.includes(cat.actionCode) && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#9fc9f5" }}>
                    Cantidad
                    <input
                      type="number"
                      min={0}
                      placeholder="1"
                      value={sel.amount}
                      onChange={(e) =>
                        patchSelection(cat.actionCode, {
                          amount: e.target.value,
                        })
                      }
                      style={{
                        width: 90,
                        padding: "6px 8px",
                        fontSize: 13,
                        borderRadius: 8,
                        border: "1px solid #2c4a7c",
                        background: "#10254a",
                        color: "white",
                        colorScheme: "dark",
                      }}
                    />
                  </label>
                )}
                <button
                  disabled={busyAction === cat.actionCode}
                  onClick={() => register(cat)}
                  style={button}
                >
                  {busyAction === cat.actionCode ? "Registrando…" : "Registrar"}
                </button>
              </div>
              </>
              )}

              {res && (
                <div
                  style={{
                    background: "#0a1426",
                    borderRadius: 8,
                    padding: 10,
                    display: "grid",
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  {res.error && <span style={{ color: "#fca5a5" }}>⚠ {res.error}</span>}
                  {!res.error &&
                    !res.updated?.length &&
                    !res.skipped?.length && (
                      <span style={{ color: "#fbbf24" }}>
                        Ningún desafío coincide con esa combinación.
                      </span>
                    )}
                  {res.updated?.map((u) => (
                    <span key={u.id}>
                      {u.is_completed ? "✅" : "📈"} {u.description} —{" "}
                      <strong>
                        {u.current_value}/{u.target_value}
                      </strong>
                      {u.is_completed ? " ¡Completado!" : ""}
                    </span>
                  ))}
                  {res.skipped?.map((s) => (
                    <span key={s.id} style={{ color: "#fbbf24" }}>
                      ⏸ {s.description} —{" "}
                      {s.reason === "no_active_match"
                        ? "requiere partida activa"
                        : "requiere elegir un lugar con nombre"}
                    </span>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {categories.length === 0 && (
          <section style={card}>
            <p style={{ margin: 0 }}>No quedan desafíos pendientes 🎉</p>
          </section>
        )}
      </div>

      {/* Desafíos por semana */}
      <section style={{ display: "grid", gap: 14 }}>
        <WeekTabs
          seasons={seasons}
          weeks={weeks}
          seasonCode={seasonCode}
          weekNumber={weekTab}
          allSelected={showAll}
          onSelectAll={() => setShowAll(true)}
          onSelectSeason={(code) => router.push(`/tracker?season=${code}&week=1`)}
          onSelectWeek={(n) => {
            setShowAll(false);
            setWeekTab(n);
            window.history.replaceState(
              null,
              "",
              `/tracker?season=${seasonCode}&week=${n}`
            );
          }}
        />

        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder={
            showAll
              ? "Buscar en todas las semanas…"
              : `Buscar en la semana ${tabWeek?.week_number ?? ""}…`
          }
        />

        {viewWeeks.map((week) => {
          const items = weekItems(week);
          const weekMeta = weekMetaOf(week);
          if (showAll && items.length === 0 && !weekMeta) return null;

          return (
        <div key={week.id} style={{ display: "grid", gap: 10 }}>
          {showAll && (
            <h3
              style={{
                fontFamily: titleFont,
                color: "#bfe6ff",
                margin: "8px 0 0",
                fontSize: 19,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontWeight: 400,
              }}
            >
              {week.display_name ?? `Semana ${week.week_number}`}
            </h3>
          )}
          {weekMeta && (
            <MissionCard
              title={`Semana ${week.week_number} · Recompensa`}
              quest={weekMeta.description}
              current={weekMeta.current_value ?? 0}
              target={weekMeta.target_value ?? 7}
              completed={weekMeta.is_completed}
              meta
            />
          )}
          {items.map((c) => {
            const current = c.current_value ?? 0;
            const target = c.target_value ?? 1;
            const locked = lockedIds.has(c.id);
            // la partida activa solo se exige para AÑADIR progreso en
            // desafíos de partida Y en fases (sistema antiguo de Fortnite);
            // quitar progreso siempre se permite
            const matchBlocked =
              (c.match_scope !== "any_match" || !!c.line_id) && !activeMatch;
            const addBlocked = locked || matchBlocked;
            const hasProgress = current > 0 || c.is_completed;
            // desafíos con varios objetivos/objetos/lugares: un botón por
            // opción; con una sola opción (o sin distinción) se mantienen
            // los controles normales. Los de cantidad (daño, vida…) nunca
            // usan botones: necesitan la cantidad editable
            const optionRules = (c.challenge_rules ?? []).filter((r) =>
              ruleLabel(r)
            );
            // "basado en opciones": el progreso viene de eventos discretos
            // (varios objetivos/lugares, o lugares con nombre distintos), no
            // de un acumulador numérico. En estos NO tiene sentido el ±1 ni la
            // barra/cantidad manual (¿qué opción restaría un −1?), ni cuando
            // ya está completado. Se controla solo con sus chips o el reset.
            const isOptionBased =
              (optionRules.length >= 2 && c.unit !== "value") ||
              c.unit === "distinct_location";
            const showOptionChips =
              isOptionBased &&
              !c.is_completed &&
              !locked &&
              optionRules.length >= 2;
            // partidas diferentes: solo se avanza de 1 en 1 y una vez por
            // partida (el RPC lo refuerza; aquí se bloquea el botón)
            const isDifferent =
              c.kind === "progress" && c.match_scope === "different_matches";
            const isDamageChallenge = (c.challenge_rules ?? []).some(
              (r) => r.action_type?.code === "damage"
            );
            const addedThisMatch =
              !!activeMatch &&
              (c.challenge_rules ?? []).some((r) =>
                ruleProgress.some(
                  (p) =>
                    p.challenge_rule_id === r.id &&
                    p.match_id === activeMatch.id
                )
              );

            return (
              <MissionCard
                key={c.id}
                title={`${SCOPE_LABEL[c.match_scope]}${
                  lineName(c.line_id) ? ` · ${lineName(c.line_id)}` : ""
                }`}
                quest={c.description}
                current={current}
                target={target}
                completed={c.is_completed}
                locked={locked}
              >
                {showOptionChips && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 6,
                    }}
                  >
                    {optionRules.map((r) => {
                      const done = isRuleDone(c, r.id);
                      // los hechos se pueden volver a apretar para deshacer
                      const chipDisabled =
                        busyRule === r.id || (!done && matchBlocked);
                      return (
                        <button
                          key={r.id}
                          disabled={chipDisabled}
                          onClick={() =>
                            done ? undoRule(r) : registerRule(c, r)
                          }
                          title={
                            done
                              ? `Quitar registro: ${ruleLabel(r) ?? ""}`
                              : (ruleLabel(r) ?? "")
                          }
                          style={{
                            minHeight: fs(36, 50),
                            height: "100%",
                            padding: `${fs(7, 11)} ${fs(10, 16)}`,
                            borderRadius: 8,
                            border: done
                              ? "1px solid #16a34a"
                              : "1px solid #2c4a7c",
                            background: done ? "#0c2818" : "#10254a",
                            color: done ? "#7ef5a8" : "#cfe6ff",
                            cursor: chipDisabled ? "default" : "pointer",
                            opacity: !done && matchBlocked ? 0.5 : 1,
                            fontSize: fs(13, 19),
                            fontWeight: 600,
                            lineHeight: 1.25,
                            width: "100%",
                            minWidth: 0,
                            whiteSpace: "normal",
                            textAlign: "left",
                          }}
                        >
                          {done ? "✔ " : "▸ "}
                          {ruleLabel(r)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {c.kind === "simple" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {/* descompletar siempre se permite; completar exige partida */}
                    <button
                      onClick={() => toggleSimpleChallenge(c)}
                      disabled={c.is_completed ? locked : addBlocked}
                      style={{
                        padding: `${fs(8, 12)} ${fs(14, 22)}`,
                        borderRadius: 8,
                        border: "1px solid #2c4a7c",
                        background: c.is_completed ? "#10254a" : "#1c74e3",
                        color: "white",
                        cursor: (c.is_completed ? locked : addBlocked)
                          ? "not-allowed"
                          : "pointer",
                        opacity: (c.is_completed ? locked : addBlocked) ? 0.5 : 1,
                        fontSize: fs(13, 19),
                        fontWeight: 700,
                      }}
                    >
                      {c.is_completed ? "Marcar como pendiente" : "Completar"}
                    </button>
                    {matchBlocked && !c.is_completed && (
                      <span style={{ color: "#fbbf24", fontSize: fs(12, 17) }}>
                        ⚠ Completar requiere partida activa
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {/* los desafíos "basados en opciones" (varios lugares,
                        lugares distintos…) no usan barra ni ±1: ¿qué opción
                        restaría un −1? Se manejan con sus chips o el reset.
                        En partidas diferentes se ajusta de a 1. */}
                    {!isOptionBased && !isDifferent && (
                    <input
                      type="range"
                      min={0}
                      max={target}
                      disabled={locked}
                      value={current}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        setChallenges((prev) =>
                          prev.map((ch) =>
                            ch.id === c.id
                              ? {
                                  ...ch,
                                  current_value: newValue,
                                  is_completed:
                                    target > 0 && newValue >= target,
                                }
                              : ch
                          )
                        );
                      }}
                      onMouseUp={(e) =>
                        setProgress(c, Number(e.currentTarget.value))
                      }
                      onTouchEnd={(e) =>
                        setProgress(c, Number(e.currentTarget.value))
                      }
                      style={{
                        width: "100%",
                        height: fs(8, 14),
                        accentColor: c.is_completed ? "#22c55e" : "#3b82f6",
                      }}
                    />
                    )}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {!isOptionBased && !isDifferent && (
                        <>
                      <input
                        type="number"
                        placeholder="Cantidad"
                        disabled={addBlocked}
                        value={customAmounts[c.id] ?? ""}
                        onChange={(e) =>
                          setCustomAmounts((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        style={{
                          padding: `${fs(7, 11)} ${fs(9, 14)}`,
                          width: fs(96, 150),
                          fontSize: fs(14, 20),
                          borderRadius: 8,
                          border: "1px solid #2c4a7c",
                          background: "#10254a",
                          color: "white",
                          colorScheme: "dark",
                          opacity: addBlocked ? 0.5 : 1,
                        }}
                      />
                      <button
                        disabled={c.is_completed || addBlocked}
                        onClick={() => {
                          // cantidad vacía o 0: no hace nada
                          const n = Number(customAmounts[c.id]);
                          if (!Number.isFinite(n) || n <= 0) return;
                          increaseProgress(c, Math.floor(n));
                        }}
                        style={{
                          padding: `${fs(8, 12)} ${fs(12, 20)}`,
                          borderRadius: 8,
                          border: "none",
                          background: "#1c74e3",
                          color: "white",
                          cursor:
                            c.is_completed || addBlocked
                              ? "not-allowed"
                              : "pointer",
                          opacity: c.is_completed || addBlocked ? 0.5 : 1,
                          fontSize: fs(13, 19),
                          fontWeight: 700,
                        }}
                      >
                        Aumentar
                      </button>
                        </>
                      )}
                      {!isOptionBased && isDifferent && (
                        <button
                          disabled={
                            c.is_completed || addBlocked || addedThisMatch
                          }
                          onClick={() => increaseProgress(c, 1)}
                          title="Suma 1 (máximo una vez por partida)"
                          style={{
                            padding: `${fs(8, 12)} ${fs(14, 22)}`,
                            borderRadius: 8,
                            border: "none",
                            background: "#1c74e3",
                            color: "white",
                            cursor:
                              c.is_completed || addBlocked || addedThisMatch
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              c.is_completed || addBlocked || addedThisMatch
                                ? 0.5
                                : 1,
                            fontSize: fs(13, 19),
                            fontWeight: 700,
                          }}
                        >
                          +1
                        </button>
                      )}
                      {!isOptionBased && !isDamageChallenge && (
                      <button
                        disabled={locked || current <= 0}
                        onClick={() => increaseProgress(c, -1)}
                        title="Reducir 1"
                        style={{
                          padding: `${fs(8, 12)} ${fs(12, 20)}`,
                          borderRadius: 8,
                          border: "1px solid #2c4a7c",
                          background: "#10254a",
                          color: "#cfe6ff",
                          cursor:
                            locked || current <= 0 ? "not-allowed" : "pointer",
                          opacity: locked || current <= 0 ? 0.5 : 1,
                          fontSize: fs(13, 19),
                          fontWeight: 700,
                        }}
                      >
                        −1
                      </button>
                      )}
                      {isDifferent && addedThisMatch && !c.is_completed && (
                        <span style={{ color: "#7ef5a8", fontSize: fs(12, 17) }}>
                          ✔ Ya se sumó en esta partida
                        </span>
                      )}
                      {hasProgress && (
                        <button
                          disabled={locked}
                          onClick={() => resetProgress(c)}
                          style={{
                            padding: `${fs(8, 12)} ${fs(12, 20)}`,
                            borderRadius: 8,
                            border: "none",
                            background:
                              "linear-gradient(180deg, #e1493a 0%, #b3271a 100%)",
                            color: "white",
                            cursor: locked ? "not-allowed" : "pointer",
                            opacity: locked ? 0.5 : 1,
                            fontSize: fs(13, 19),
                            fontWeight: 700,
                          }}
                        >
                          {c.is_completed ? "Descompletar" : "Quitar progreso"}
                        </button>
                      )}
                      {matchBlocked && showOptionChips && (
                        <span style={{ color: "#fbbf24", fontSize: fs(12, 17) }}>
                          ⚠ Registrar requiere partida activa
                        </span>
                      )}
                      {matchBlocked && !isOptionBased && !c.is_completed && (
                        <span style={{ color: "#fbbf24", fontSize: fs(12, 17) }}>
                          ⚠ Aumentar requiere partida activa
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </MissionCard>
            );
          })}
        </div>
          );
        })}

        {query &&
          viewWeeks.every(
            (w) => weekItems(w).length === 0 && !weekMetaOf(w)
          ) && (
            <p style={{ color: "#9fc9f5", margin: 0 }}>
              Ningún desafío coincide con &quot;{search}&quot;.
            </p>
          )}
      </section>
      </div>
    </main>
  );
}
