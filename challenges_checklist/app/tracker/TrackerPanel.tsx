"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import FortniteIcon from "../components/FortniteIcon";
import AdminBulkMenu from "../components/AdminBulkMenu";
import { getMissionVisual } from "../lib/missionAssets";
import LogoutButton from "../components/LogoutButton";
import MissionRow from "../components/MissionRow";
import MissionProgressSlider from "../components/MissionProgressSlider";
import PageBackground from "../components/PageBackground";
import SearchBox from "../components/SearchBox";
import IncompleteOnlyToggle from "../components/IncompleteOnlyToggle";
import PrestigeViewToggle from "../components/PrestigeViewToggle";
import WeekTabs from "../components/WeekTabs";
import TrackerWeekAccordion from "./TrackerWeekAccordion";
import TopNav from "../components/TopNav";
import TrackerLogsPanel from "../components/TrackerLogsPanel";
import {
  TrackerLocalResultFeed,
  TrackerMiniLogFeed,
} from "../components/TrackerMiniLogFeed";
import { contentWrap, fnt, fs, pageBackground, pageMain, panel, pillTab, titleFont, weekAccent, yellowButton } from "../lib/theme";
import {
  globalSection,
  logTrackerActivity,
  MATCH_SECTION,
  upsertSectionLogRow,
  WEEK_SECTION,
  type TrackerLogActionContext,
  type TrackerLogPayload,
  type TrackerLogRow,
} from "../lib/trackerLog";
import { specialLandKind } from "../lib/specialMissions";
import type { Season, Week } from "../lib/selection";
import {
  ACTION_EMOJI,
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
import { isPanelMiscChallenge, normalizeSearchObjectFields } from "../lib/trackerUtils";
import {
  buildDistinctProgressIndex,
  buildRuleProgressIndex,
  debounce,
  fetchFullChallenges,
  fetchProgressOnly,
  patchChallengeRow,
  patchChallengesFromReport,
  patchDistinctRow,
  patchRuleProgressRow,
  ruleProgressHit,
  type DistinctRow,
  type RuleProgressRow,
} from "../lib/trackerSync";
import { useTrackerLiteMode } from "../lib/trackerLite";

// fila de match_rule_progress para marcar qué parte de un desafío
// multi-opción ya está registrada
// (tipos en trackerSync.ts)

// fila de challenge_distinct_progress: lugares ya contados por un desafío
// de "lugares con nombre diferentes"

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

  // cañón pirata → destino con nombre: ofrecer POIs con nombre
  if (
    covered.some((r) => r.conds.some((c) => c.key === "arrived_named_location"))
  ) {
    for (const l of namedLocations) locs.set(l.id, l);
  }

  // aterrizaje tras 3 respiraderos: elegir POI con nombre en el panel Aterrizar
  if (
    cat.rules.some((r) =>
      r.conds.some((c) => c.key === "named_landing_after_3_vents")
    )
  ) {
    for (const l of namedLocations) locs.set(l.id, l);
  }

  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label);

  if (cat.actionCode === "search") {
    for (const [k, v] of used) target.set(k, v);
    used.clear();
  }

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
const QUANTITY_ACTIONS = ["use", "destroy", "gain", "harvest"];

const DISCRETE_CONTROL_THRESHOLD = 20;

type MissionControls = {
  isOptionBased: boolean;
  isDifferent: boolean;
  showSlider: boolean;
  showAmountInput: boolean;
  showIncrementBulk: boolean;
  showPlusOne: boolean;
  showMinusOne: boolean;
};

function challengeRuleActions(c: Challenge): Set<string> {
  return new Set(
    (c.challenge_rules ?? [])
      .map((r) => r.action_type?.code)
      .filter((code): code is string => !!code)
  );
}

function isQuantityMission(c: Challenge, optionRules: Rule[]): boolean {
  if (c.unit === "value") return true;
  if (c.unit !== "count") return false;
  const actions = challengeRuleActions(c);
  if (!actions.size) return false;
  return [...actions].every((a) =>
    ["use", "destroy", "gain", "harvest"].includes(a)
  );
}

function deriveMissionControls(
  c: Challenge,
  optionRules: Rule[]
): MissionControls {
  const isOptionBased =
    (optionRules.length >= 2 && c.unit !== "value") ||
    c.unit === "distinct_location";
  const isDifferent =
    c.kind === "progress" && c.match_scope === "different_matches";
  const target = c.target_value ?? 1;
  const smallTarget = target <= DISCRETE_CONTROL_THRESHOLD;
  const quantityMission = isQuantityMission(c, optionRules);

  if (isOptionBased) {
    return {
      isOptionBased,
      isDifferent,
      showSlider: false,
      showAmountInput: false,
      showIncrementBulk: false,
      showPlusOne: false,
      showMinusOne: false,
    };
  }
  if (isDifferent) {
    return {
      isOptionBased,
      isDifferent,
      showSlider: false,
      showAmountInput: false,
      showIncrementBulk: false,
      showPlusOne: true,
      showMinusOne: false,
    };
  }
  if (c.unit === "value" || quantityMission) {
    return {
      isOptionBased,
      isDifferent,
      showSlider: c.unit === "value" || smallTarget,
      showAmountInput: true,
      showIncrementBulk: c.unit === "value" || quantityMission,
      showPlusOne: c.unit === "count",
      showMinusOne: c.unit === "count" && smallTarget,
    };
  }
  return {
    isOptionBased,
    isDifferent,
    showSlider: smallTarget,
    showAmountInput: false,
    showIncrementBulk: false,
    showPlusOne: true,
    showMinusOne: smallTarget,
  };
}

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

function ruleNeedsNamedArrival(r: Rule): boolean {
  return r.rule_conditions.some(
    (c) => c.condition_key === "arrived_named_location"
  );
}

export default function TrackerPanel({
  seasons,
  weeks,
  seasonCode,
  initialWeekNumber: _initialWeekNumber,
  initialChallenges,
  actionTypes,
  locations,
  initialActiveMatch,
  initialRuleProgress,
  initialDistinctProgress,
  effects,
  isAdmin,
  userId,
  actorName,
  initialLite = false,
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
  userId: string;
  actorName: string;
  initialLite?: boolean;
}) {
  const { lite, toggleLite } = useTrackerLiteMode(initialLite);
  const supabase = createClient();
  const router = useRouter();

  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [ruleProgress, setRuleProgress] =
    useState<RuleProgressRow[]>(initialRuleProgress);
  const [distinctProgress, setDistinctProgress] = useState<DistinctRow[]>(
    initialDistinctProgress
  );
  const [activeMatch, setActiveMatch] = useState<Match | null>(initialActiveMatch);
  const [selectedWeekNumbers, setSelectedWeekNumbers] = useState<Set<number>>(
    () => new Set()
  );
  const [expandedWeekIds, setExpandedWeekIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [results, setResults] = useState<Record<string, ReportResult>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyMatch, setBusyMatch] = useState(false);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [cannonArrivalByChallenge, setCannonArrivalByChallenge] = useState<
    Record<string, string>
  >({});
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  // vista de prestigio en el panel por semana (no mezclar con los normales)
  const [prestigeView, setPrestigeView] = useState(false);
  const [trackerView, setTrackerView] = useState<"track" | "logs">("track");
  const [remoteLogs, setRemoteLogs] = useState<Record<string, TrackerLogRow[]>>(
    {}
  );

  const pushSectionLog = (row: TrackerLogRow) => {
    setRemoteLogs((prev) => upsertSectionLogRow(prev, row));
  };

  function makeLogRow(
    section: string,
    actionCode: string | null,
    payload: TrackerLogPayload
  ): TrackerLogRow {
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      actor_name: actorName,
      section,
      action_code: actionCode,
      payload,
      created_at: new Date().toISOString(),
    };
  }

  async function emitLog(
    section: string,
    actionCode: string | null,
    payload: TrackerLogPayload
  ) {
    pushSectionLog(makeLogRow(section, actionCode, payload));
    await logTrackerActivity(supabase, section, actionCode, payload);
  }

  function buildRegisterActionContext(
    cat: Category,
    sel: Selection,
    view: CategoryView,
    amount: number
  ): TrackerLogActionContext {
    const labelFor = (key: string | null, options: Option[]) =>
      key ? (options.find((o) => o.key === key)?.label ?? null) : null;
    const condLabels = view.condOptions
      .filter((c) => c.auto || sel.conds.includes(c.key))
      .map((c) => c.label);
    const showAmount =
      cat.hasValue ||
      QUANTITY_ACTIONS.includes(cat.actionCode) ||
      amount !== 1;
    return {
      actionName: cat.actionName,
      amount: showAmount ? amount : undefined,
      used: labelFor(sel.used, view.usedOptions),
      target: labelFor(sel.target, view.targetOptions),
      location: view.locationOptions.find((l) => l.id === sel.loc)?.label ?? null,
      conditions: condLabels.length ? condLabels : undefined,
    };
  }

  function ruleActionContext(r: Rule): TrackerLogActionContext {
    return {
      actionName: r.action_type?.display_name ?? undefined,
      used:
        r.required_object?.display_name ?? r.required_tag?.display_name ?? null,
      target:
        r.target_object?.display_name ?? r.target_tag?.display_name ?? null,
      location: r.location?.display_name ?? null,
      conditions: r.rule_conditions.length
        ? r.rule_conditions.map((c) => c.condition_value)
        : undefined,
    };
  }

  function reportPayload(data: unknown, error?: string): TrackerLogPayload {
    if (error) return { error };
    const res = (data ?? {}) as ReportResult;
    return {
      updated: res.updated,
      skipped: res.skipped,
      error: res.error,
    };
  }

  // re-sincroniza cuando el servidor manda otra temporada (ajuste de estado
  // durante el render comparando la prop anterior, sin efecto)
  const [prevInitial, setPrevInitial] = useState(initialChallenges);
  if (prevInitial !== initialChallenges) {
    setPrevInitial(initialChallenges);
    setChallenges(initialChallenges);
  }

  const weekIds = useMemo(() => weeks.map((w) => w.id), [weeks]);
  const weekIdSet = useMemo(() => new Set(weekIds), [weekIds]);

  const selectedWeekIdSet = useMemo(() => {
    return new Set(
      weeks
        .filter((w) => selectedWeekNumbers.has(w.week_number))
        .map((w) => w.id)
    );
  }, [weeks, selectedWeekNumbers]);

  const hasWeekFilter = selectedWeekNumbers.size > 0;

  useEffect(() => {
    setSelectedWeekNumbers(new Set());
  }, [seasonCode]);

  const toggleWeekSelection = useCallback((weekNumber: number) => {
    setSelectedWeekNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(weekNumber)) next.delete(weekNumber);
      else next.add(weekNumber);
      return next;
    });
  }, []);

  const selectAllWeeks = useCallback(() => {
    setSelectedWeekNumbers(new Set(weeks.map((w) => w.week_number)));
  }, [weeks]);

  const selectNoWeeks = useCallback(() => {
    setSelectedWeekNumbers(new Set());
  }, []);

  const toggleWeekExpanded = useCallback((weekId: string) => {
    setExpandedWeekIds((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) next.delete(weekId);
      else next.add(weekId);
      return next;
    });
  }, []);

  useEffect(() => {
    const validIds = new Set(
      weeks
        .filter((w) => selectedWeekNumbers.has(w.week_number))
        .map((w) => w.id)
    );
    setExpandedWeekIds((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [weeks, selectedWeekNumbers]);
  const activeMatchRef = useRef(initialActiveMatch);
  activeMatchRef.current = activeMatch;

  const loadProgress = useCallback(async () => {
    const bundle = await fetchProgressOnly(
      supabase,
      activeMatchRef.current?.id ?? null
    );
    setRuleProgress(bundle.ruleProgress);
    setDistinctProgress(bundle.distinctProgress);
  }, [supabase]);

  const loadFullChallenges = useCallback(async () => {
    if (!weekIds.length) return;
    try {
      const data = await fetchFullChallenges(supabase, weekIds);
      setChallenges(data);
      await loadProgress();
    } catch {
      /* ignore */
    }
  }, [supabase, weekIds, loadProgress]);

  const debouncedFullLoadRef = useRef(
    debounce(() => {
      void loadFullChallenges();
    }, 220)
  );

  useEffect(() => {
    debouncedFullLoadRef.current = debounce(() => {
      void loadFullChallenges();
    }, 220);
    return () => debouncedFullLoadRef.current.cancel();
  }, [loadFullChallenges]);

  async function loadMatch() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    const next = (data as Match) ?? null;
    setActiveMatch(next);
    activeMatchRef.current = next;
    await loadProgress();
  }

  useEffect(() => {
    const channel = supabase
      .channel("tracker-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        (payload) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (eventType === "DELETE" ? payload.old : payload.new) as
            | (Partial<Challenge> & { id: string })
            | undefined;
          if (!row?.id) return;
          if (eventType === "INSERT") {
            debouncedFullLoadRef.current();
            return;
          }
          setChallenges((prev) =>
            patchChallengeRow(prev, eventType, row, weekIdSet)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          void loadMatch();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_rule_progress" },
        (payload) => {
          const eventType = payload.eventType;
          const row = (eventType === "DELETE" ? payload.old : payload.new) as
            | (RuleProgressRow & { id?: string })
            | undefined;
          if (!row?.challenge_rule_id) return;
          setRuleProgress((prev) =>
            patchRuleProgressRow(prev, eventType, row)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenge_distinct_progress" },
        (payload) => {
          const eventType = payload.eventType;
          const row = (eventType === "DELETE" ? payload.old : payload.new) as
            | DistinctRow
            | undefined;
          if (!row?.challenge_id) return;
          setDistinctProgress((prev) =>
            patchDistinctRow(prev, eventType, row)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIds.join(",")]);

  useEffect(() => {
    if (trackerView !== "logs") return;
    const channel = supabase
      .channel("tracker-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracker_activity_logs" },
        (payload) => pushSectionLog(payload.new as TrackerLogRow)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, trackerView]);

  const lockedIds = useMemo(() => computeLockedIds(challenges), [challenges]);

  const ruleProgressIndex = useMemo(
    () => buildRuleProgressIndex(ruleProgress),
    [ruleProgress]
  );

  const distinctProgressIndex = useMemo(
    () => buildDistinctProgressIndex(distinctProgress),
    [distinctProgress]
  );

  const deferredSearch = useDeferredValue(search);

  // Prestigio bloqueado: ids de desafíos de prestigio cuya semana aún tiene
  // desafíos normales sin completar. No se pueden avanzar (el motor lo bloquea)
  // y se ocultan de las acciones rápidas.
  const prestigeLockedIds = useMemo(() => {
    // semana bloqueada si tiene un normal incompleto O uno completado en la
    // partida aún activa (completed_in_match no nulo): así el prestigio no se
    // activa en la misma partida en que se cierra la semana, sino en la próxima
    const weekBlocked = new Set<string>();
    for (const c of challenges) {
      if (c.is_meta || c.is_prestige || !c.week_id) continue;
      if (!c.is_completed || c.completed_in_match) weekBlocked.add(c.week_id);
    }
    const set = new Set<string>();
    for (const c of challenges) {
      if (c.is_prestige && c.week_id && weekBlocked.has(c.week_id)) {
        set.add(c.id);
      }
    }
    return set;
  }, [challenges]);

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

  // Solo misiones con exactamente 1 regla misc (multi-regla → vista semanal).
  const miscChallenges = useMemo(
    () =>
      challenges.filter(
        (c) =>
          isPanelMiscChallenge(c) &&
          !c.is_completed &&
          !c.is_meta &&
          !lockedIds.has(c.id) &&
          !prestigeLockedIds.has(c.id) &&
          hasWeekFilter &&
          !!c.week_id &&
          selectedWeekIdSet.has(c.week_id)
      ),
    [challenges, lockedIds, prestigeLockedIds, hasWeekFilter, selectedWeekIdSet]
  );

  // Categorías del panel global: reglas pendientes de las semanas seleccionadas,
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
      if (
        c.is_completed ||
        c.is_meta ||
        lockedIds.has(c.id) ||
        prestigeLockedIds.has(c.id) ||
        !hasWeekFilter ||
        !c.week_id ||
        !selectedWeekIdSet.has(c.week_id)
      )
        continue;
      const totalRules = c.challenge_rules?.length ?? 0;

      for (const r of c.challenge_rules ?? []) {
        const code = r.action_type?.code;
        if (!code) continue;

        if (
          code === "misc" &&
          r.rule_conditions.some((rc) => rc.condition_key === "win_match") &&
          !r.rule_conditions.some(
            (rc) => rc.condition_key === "only_vending_weapons"
          )
        ) {
          continue;
        }

        // opción ya satisfecha
        let satisfied = false;
        if (
          c.match_scope === "any_match" &&
          c.rules_operator === "and" &&
          totalRules > 1
        ) {
          satisfied = ruleProgressHit(
            ruleProgressIndex,
            r.id,
            (p) => p.match_id === null
          );
        } else if (
          (c.match_scope === "same_match" && totalRules > 1) ||
          c.match_scope === "different_matches"
        ) {
          satisfied =
            !!activeMatch &&
            ruleProgressHit(
              ruleProgressIndex,
              r.id,
              (p) => p.match_id === activeMatch.id
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
        if (QUANTITY_ACTIONS.includes(code)) acc.hasValue = true;

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
        const ruleFields = normalizeSearchObjectFields(code, {
          usedKey: usedOption?.key ?? null,
          usedOption,
          targetKey: targetOption?.key ?? null,
          targetOption,
        });
        acc.rules.push({
          usedKey: ruleFields.usedKey,
          usedOption: ruleFields.usedOption as Option | null,
          targetKey: ruleFields.targetKey,
          targetOption: ruleFields.targetOption as Option | null,
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
                (distinctProgressIndex.get(c.id) ?? [])
                  .filter((d) =>
                    c.match_scope === "same_match"
                      ? d.match_id === (activeMatch?.id ?? "__none__")
                      : d.match_id === null
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
    prestigeLockedIds,
    actionTypes,
    effects,
    ruleProgressIndex,
    distinctProgressIndex,
    activeMatch,
    hasWeekFilter,
    selectedWeekIdSet,
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
    let target = parse(sel.target);
    if (cat.actionCode === "search" && !target.obj && !target.tag) {
      if (used.obj || used.tag) target = { ...used };
    }

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
    } else if (
      cat.hasValue &&
      !QUANTITY_ACTIONS.includes(cat.actionCode)
    ) {
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
    if (!error) {
      const res = (data ?? {}) as ReportResult;
      if (res.updated?.length) {
        setChallenges((prev) => patchChallengesFromReport(prev, res.updated!));
      }
      await emitLog(
        globalSection(cat.actionCode),
        cat.actionCode,
        {
          ...reportPayload(data),
          action: buildRegisterActionContext(cat, sel, view, amount),
        }
      );
    }
  }

  async function startMatch() {
    setBusyMatch(true);
    const { error } = await supabase.rpc("start_match");
    setBusyMatch(false);
    if (error) alert(error.message);
    else
      await emitLog(MATCH_SECTION, "start", {
        message: "🟢 Partida iniciada",
        action: { actionName: "Partida", conditions: ["Iniciar"] },
      });
    loadMatch();
  }

  async function endMatch() {
    setBusyMatch(true);
    const { error } = await supabase.rpc("end_active_match");
    setBusyMatch(false);
    if (error) alert(error.message);
    else
      await emitLog(MATCH_SECTION, "end", {
        message: "Partida terminada",
        action: { actionName: "Partida", conditions: ["Terminar"] },
      });
    loadMatch();
  }

  /** Victoria: aplica win_match a lo pendiente y cierra la partida. */
  async function winMatch() {
    if (!activeMatch) {
      alert("Requiere una partida activa.");
      return;
    }
    setBusyMatch(true);
    const { data, error } = await supabase.rpc("report_event", {
      p_action_code: "misc",
      p_amount: 1,
      p_conditions: ["win_match"],
    });
    if (error) {
      setBusyMatch(false);
      alert(error.message);
      return;
    }
    await emitLog(MATCH_SECTION, "win", {
      ...reportPayload(data),
      action: {
        actionName: "Victoria",
        amount: 1,
        conditions: ["Ganar partida"],
      },
    });
    const winRes = data as ReportResult;
    if (winRes?.updated?.length) {
      setChallenges((prev) => patchChallengesFromReport(prev, winRes.updated!));
    }
    const { error: endErr } = await supabase.rpc("end_active_match");
    setBusyMatch(false);
    if (endErr) alert(endErr.message);
    loadMatch();
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
    } else {
      await emitLog(WEEK_SECTION, null, {
        message: `${challenge.is_completed ? "↩" : "✅"} ${challenge.description}`,
        action: {
          actionName: "Vista semanal",
          conditions: [challenge.is_completed ? "Desmarcar" : "Completar"],
        },
      });
    }
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
    else {
      await emitLog(WEEK_SECTION, null, {
        message: `🔄 Progreso reiniciado: ${challenge.description}`,
        action: {
          actionName: "Vista semanal",
          conditions: ["Reiniciar progreso"],
        },
      });
    }
  }

  // ---- desafíos multi-opción: un botón por objetivo/objeto/lugar ----

  // etiqueta que distingue cada opción dentro del desafío
  function ruleLabel(r: Rule): string | null {
    const fromCamp = r.rule_conditions.find((c) =>
      c.condition_key.startsWith("from_pirate_camp_")
    );
    const parts = [
      r.required_object?.display_name ?? r.required_tag?.display_name,
      r.target_object?.display_name ?? r.target_tag?.display_name,
      r.location?.display_name,
      fromCamp?.condition_value,
    ].filter((p): p is string => !!p);
    if (!parts.length && r.rule_conditions.length) {
      return r.rule_conditions.map((c) => c.condition_value).join(" · ");
    }
    return parts.length ? parts.join(" · ") : null;
  }

  function ruleConditionKeys(r: Rule): string[] {
    return r.rule_conditions.map((rc) => rc.condition_key);
  }

  // ¿esta opción ya quedó registrada? (acumulador global para any_match;
  // por partida activa para same_match; cualquier partida para different)
  function isRuleDone(c: Challenge, ruleId: string): boolean {
    if (c.match_scope === "same_match") {
      return (
        !!activeMatch &&
        ruleProgressHit(
          ruleProgressIndex,
          ruleId,
          (p) => p.match_id === activeMatch.id
        )
      );
    }
    if (c.match_scope === "different_matches") {
      return ruleProgressHit(
        ruleProgressIndex,
        ruleId,
        (p) => p.match_id !== null
      );
    }
    return ruleProgressHit(
      ruleProgressIndex,
      ruleId,
      (p) => p.match_id === null
    );
  }

  async function registerRule(c: Challenge, r: Rule) {
    if (!r.action_type) return;
    const needsArrival = ruleNeedsNamedArrival(r);
    const arrivalLoc = cannonArrivalByChallenge[c.id] ?? null;
    if (needsArrival && (!arrivalLoc || !namedLocIds.has(arrivalLoc))) {
      alert("Elige la ubicación con nombre donde caíste antes de registrar.");
      return;
    }
    const conditions = ruleConditionKeys(r);
    setBusyRule(r.id);
    const { data, error } = await supabase.rpc("report_event", {
      p_action_code: r.action_type.code,
      p_amount: 1,
      p_used_object_id: r.required_object?.id ?? null,
      p_used_tag_id: r.required_tag?.id ?? null,
      p_target_object_id: r.target_object?.id ?? null,
      p_target_tag_id: r.target_tag?.id ?? null,
      p_location_id: needsArrival
        ? arrivalLoc
        : (r.location?.id ?? null),
      p_conditions: conditions,
    });
    setBusyRule(null);

    if (error) {
      alert(error.message);
    } else {
      const res = data as {
        updated?: ReportUpdated[];
        skipped?: { reason?: string }[];
      } | null;
      if (res?.skipped?.length && !res?.updated?.length) {
        alert(
          res.skipped[0].reason === "no_active_match"
            ? "Requiere una partida activa"
            : "No aplicó: requiere un lugar con nombre"
        );
      }
      const code = r.action_type?.code ?? null;
      await emitLog(
        code ? globalSection(code) : WEEK_SECTION,
        code,
        {
          ...reportPayload(data),
          action: ruleActionContext(r),
        }
      );
      if (res?.updated?.length) {
        setChallenges((prev) => patchChallengesFromReport(prev, res.updated!));
      }
    }
  }

  // despresionar una opción ya registrada: quita ese registro y recalcula
  async function undoRule(r: Rule) {
    setBusyRule(r.id);
    const { error } = await supabase.rpc("undo_rule_event", {
      p_rule_id: r.id,
    });
    setBusyRule(null);
    if (error) alert(error.message);
    else {
      const code = r.action_type?.code ?? null;
      await emitLog(
        code ? globalSection(code) : WEEK_SECTION,
        code,
        {
          message: `↩ Registro quitado: ${ruleLabel(r) ?? "opción"}`,
          action: ruleActionContext(r),
        }
      );
    }
  }

  async function increaseProgress(challenge: Challenge, amount: number) {
    const { error } = await supabase.rpc("increase_challenge_progress", {
      p_challenge_id: challenge.id,
      p_increase_value: amount,
    });

    if (error) alert(error.message);
    else {
      await emitLog(WEEK_SECTION, null, {
        message: `${amount >= 0 ? "+" : ""}${amount} · ${challenge.description}`,
        action: {
          actionName: "Vista semanal",
          amount: Math.abs(amount),
          conditions: ["Ajustar progreso"],
        },
      });
    }
  }

  async function setProgress(challenge: Challenge, newValue: number) {
    const { error } = await supabase.rpc("update_challenge_progress", {
      p_challenge_id: challenge.id,
      p_current_value: newValue,
    });

    if (error) alert(error.message);
    else {
      await emitLog(WEEK_SECTION, null, {
        message: `=${newValue} · ${challenge.description}`,
        action: {
          actionName: "Vista semanal",
          amount: newValue,
          conditions: ["Fijar progreso"],
        },
      });
    }
  }

  // ---- vista por semana (overview) ----
  const viewWeeks = useMemo(
    () => weeks.filter((w) => selectedWeekNumbers.has(w.week_number)),
    [weeks, selectedWeekNumbers]
  );
  const query = normalizeText(deferredSearch.trim());

  const searchPlaceholder = !hasWeekFilter
    ? "Selecciona semanas arriba para buscar…"
    : selectedWeekNumbers.size === 1
      ? `Buscar en la semana ${[...selectedWeekNumbers][0]}…`
      : "Buscar en las semanas seleccionadas…";

  const categoryViews = useMemo(() => {
    const map = new Map<string, CategoryView>();
    for (const cat of categories) {
      map.set(
        cat.actionCode,
        deriveCategoryView(cat, getSelection(cat.actionCode), namedLocations)
      );
    }
    return map;
  }, [categories, selections, namedLocations]);

  const weekPanels = useMemo(() => {
    return viewWeeks.map((week) => {
      const items = sortWeekChallenges(
        challenges.filter(
          (c) =>
            c.week_id === week.id && !c.is_meta && !!c.is_prestige === prestigeView
        )
      ).filter(
        (c) =>
          (!onlyIncomplete || !c.is_completed) &&
          (!query || normalizeText(c.description).includes(query))
      );
      const meta = prestigeView
        ? null
        : challenges.find((c) => c.week_id === week.id && c.is_meta);
      const metaFiltered =
        meta &&
        (!onlyIncomplete || !meta.is_completed) &&
        (!query || normalizeText(meta.description).includes(query))
          ? meta
          : null;
      const normals = challenges.filter(
        (c) => c.week_id === week.id && !c.is_meta && !c.is_prestige
      );
      const prest = challenges.filter(
        (c) => c.week_id === week.id && !c.is_meta && c.is_prestige
      );
      const nDone = normals.filter((c) => c.is_completed).length;
      const pDone = prest.filter((c) => c.is_completed).length;
      const nPct = normals.length ? (nDone / normals.length) * 100 : 0;
      const pPct = prest.length ? (pDone / prest.length) * 100 : 0;
      return {
        week,
        items,
        meta: metaFiltered,
        percent: nPct + pPct,
      };
    });
  }, [
    viewWeeks,
    challenges,
    prestigeView,
    onlyIncomplete,
    query,
  ]);


  // ---- estilos ----
  const card: React.CSSProperties = {
    background: fnt.panel,
    border: `1px solid ${fnt.border}`,
    borderRadius: 12,
    padding: 18,
    color: "white",
    ...(lite
      ? {}
      : {
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }),
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
      {lite ? (
        <div
          className="fn-bg"
          aria-hidden
          style={{ background: pageBackground, position: "fixed", inset: 0, zIndex: -1 }}
        />
      ) : (
        <PageBackground />
      )}
      <div style={contentWrap}>
      <TopNav
        sticky
        solidSurface={lite}
        tabs={navTabs}
        right={
          <>
            {isAdmin && (
              <AdminBulkMenu
                onDone={() => {
                  loadMatch();
                  void loadFullChallenges();
                  setRemoteLogs({});
                  window.dispatchEvent(new Event("tracker-logs-cleared"));
                }}
              />
            )}
            <LogoutButton />
          </>
        }
        matchControls={{
          activeMatch,
          busy: busyMatch,
          onStart: startMatch,
          onWin: winMatch,
          onEnd: endMatch,
        }}
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
            Registro de eventos · filtra por semanas seleccionadas
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={pillTab(trackerView === "track")}
            onClick={() => setTrackerView("track")}
          >
            Supervisión
          </button>
          <button
            type="button"
            style={pillTab(trackerView === "logs")}
            onClick={() => setTrackerView("logs")}
          >
            Registro
          </button>
          <button
            type="button"
            style={pillTab(lite)}
            onClick={toggleLite}
            title="Menos animaciones y sin blur (recomendado con el directo abierto)"
          >
            {lite ? "Modo ligero" : "Modo completo"}
          </button>
        </div>
      </header>

      {trackerView === "track" && (
        <div style={{ marginBottom: 20 }}>
          <WeekTabs
            multiSelect
            seasons={seasons}
            weeks={weeks}
            seasonCode={seasonCode}
            selectedWeeks={[...selectedWeekNumbers]}
            onToggleWeek={toggleWeekSelection}
            onSelectAllWeeks={selectAllWeeks}
            onSelectNoneWeeks={selectNoWeeks}
            onSelectSeason={(code) => router.push(`/tracker?season=${code}`)}
          />
        </div>
      )}

      {trackerView === "logs" && (
        <TrackerLogsPanel actionTypes={actionTypes} />
      )}

      {trackerView === "track" && remoteLogs[MATCH_SECTION]?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <TrackerMiniLogFeed entries={remoteLogs[MATCH_SECTION] ?? []} />
        </div>
      )}

      {trackerView === "track" && (
      <>
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
          const view = categoryViews.get(cat.actionCode)!;
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

              {view.usedOptions.length > 0 && cat.actionCode !== "search" && (
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
                  <span style={groupLabel}>
                    {cat.actionCode === "search" ? "Contenedor" : "Objetivo"}
                  </span>
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
                {!cat.hasValue || NO_AMOUNT_ACTIONS.includes(cat.actionCode) ? null : (
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

              {(remoteLogs[globalSection(cat.actionCode)]?.length ?? 0) > 0 && (
                <TrackerMiniLogFeed
                  entries={remoteLogs[globalSection(cat.actionCode)] ?? []}
                />
              )}

              {res?.error && <TrackerLocalResultFeed result={res} />}
            </section>
          );
        })}
        {categories.length === 0 && (
          <section style={card}>
            <p style={{ margin: 0 }}>
              {!hasWeekFilter
                ? "Selecciona una o más semanas arriba para ver las acciones rápidas."
                : "No quedan desafíos pendientes en las semanas seleccionadas 🎉"}
            </p>
          </section>
        )}
      </div>

      {/* Desafíos por semana */}
      {(remoteLogs[WEEK_SECTION]?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 12 }}>
          <TrackerMiniLogFeed entries={remoteLogs[WEEK_SECTION] ?? []} />
        </div>
      )}
      <section style={{ display: "grid", gap: 14 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 240px", maxWidth: 420 }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={searchPlaceholder}
            />
          </div>
          <PrestigeViewToggle
            active={prestigeView}
            onToggle={() => setPrestigeView((p) => !p)}
          />
          <IncompleteOnlyToggle
            active={onlyIncomplete}
            onChange={setOnlyIncomplete}
          />
        </div>

        {!hasWeekFilter && (
          <p style={{ color: "#9fc9f5", margin: 0 }}>
            Selecciona semanas arriba para ver los desafíos.
          </p>
        )}

        {weekPanels.map(({ week, items, meta: weekMeta, percent }) => {
          if (items.length === 0 && !weekMeta) return null;

          const accent = weekAccent(week.week_number);
          const expanded = expandedWeekIds.has(week.id);
          return (
        <TrackerWeekAccordion
          key={week.id}
          expanded={expanded}
          onToggle={() => toggleWeekExpanded(week.id)}
          label="Desafíos del pase de batalla"
          title={week.display_name ?? `Semana ${week.week_number}`}
          subtitle="Completa los objetivos para avanzar"
          percent={percent}
          accent={accent}
        >
          {weekMeta && (
            <MissionRow
              quest={weekMeta.description}
              current={weekMeta.current_value ?? 0}
              target={weekMeta.target_value ?? 7}
              completed={weekMeta.is_completed}
              meta
              first
            />
          )}
          {items.map((c, i) => {
            const current = c.current_value ?? 0;
            const target = c.target_value ?? 1;
            // bloqueado por fase O por ser prestigio con la semana incompleta
            const locked = lockedIds.has(c.id) || prestigeLockedIds.has(c.id);
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
            const landKind = specialLandKind(c);
            const displayOptionRules =
              landKind === "high_point_win"
                ? optionRules.filter((r) => r.action_type?.code === "land")
                : optionRules;
            const ctrl = deriveMissionControls(c, displayOptionRules);
            const showOptionChips =
              ctrl.isOptionBased &&
              !c.is_completed &&
              !locked &&
              displayOptionRules.length >= 2;
            const needsCannonArrival = optionRules.some(ruleNeedsNamedArrival);
            const addedThisMatch =
              !!activeMatch &&
              (c.challenge_rules ?? []).some((r) =>
                ruleProgressHit(
                  ruleProgressIndex,
                  r.id,
                  (p) => p.match_id === activeMatch.id
                )
              );

            const singleRule =
              (c.challenge_rules ?? []).length === 1
                ? c.challenge_rules![0]
                : null;
            const singleLocLabel = singleRule?.location?.display_name ?? null;
            const singleAction = singleRule?.action_type?.code;
            const showLocHint =
              !!singleLocLabel && !showOptionChips && !c.is_completed;

            return (
              <MissionRow
                key={c.id}
                quest={c.description}
                current={current}
                target={target}
                completed={c.is_completed}
                locked={locked}
                accent={accent}
                first={!weekMeta && i === 0}
                visual={getMissionVisual(c)}
              >
                {showLocHint && !landKind && (
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: fs(12, 17),
                      color: "#9fc9f5",
                    }}
                  >
                    {singleAction === "dance"
                      ? "Bailar en: "
                      : singleAction === "visit"
                        ? "Visitar: "
                        : "Lugar: "}
                    <strong style={{ color: "#cfe6ff" }}>
                      {singleLocLabel}
                    </strong>
                  </p>
                )}
                {showOptionChips && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {needsCannonArrival && (
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: fs(12, 17),
                          color: "#9fc9f5",
                          flexWrap: "wrap",
                        }}
                      >
                        Llegada (ubicación con nombre):
                        <select
                          value={cannonArrivalByChallenge[c.id] ?? ""}
                          disabled={addBlocked}
                          onChange={(e) =>
                            setCannonArrivalByChallenge((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          style={{
                            padding: `${fs(6, 10)} ${fs(8, 12)}`,
                            borderRadius: 8,
                            border: "1px solid #2c4a7c",
                            background: "#10254a",
                            color: "white",
                            fontSize: fs(12, 17),
                            minWidth: fs(160, 240),
                            opacity: addBlocked ? 0.5 : 1,
                          }}
                        >
                          <option value="">— Elegir POI —</option>
                          {namedLocations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 6,
                    }}
                  >
                    {displayOptionRules.map((r) => {
                      const done = isRuleDone(c, r.id);
                      const needsArrival = ruleNeedsNamedArrival(r);
                      const arrivalOk =
                        !needsArrival ||
                        (!!cannonArrivalByChallenge[c.id] &&
                          namedLocIds.has(cannonArrivalByChallenge[c.id]));
                      const chipDisabled =
                        busyRule === r.id ||
                        (!done && (matchBlocked || !arrivalOk));
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
                  </div>
                )}
                {landKind === "named_after_vents" ? (
                  hasProgress && (
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
                  )
                ) : c.kind === "simple" ? (
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
                    {ctrl.showSlider && (
                    <MissionProgressSlider
                      challengeId={c.id}
                      current={current}
                      target={target}
                      locked={locked}
                      accent={c.is_completed ? "#22c55e" : "#3b82f6"}
                      onCommit={(v) => setProgress(c, v)}
                    />
                    )}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {ctrl.showAmountInput && (
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
                      {ctrl.showIncrementBulk && (
                      <button
                        disabled={c.is_completed || addBlocked}
                        onClick={() => {
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
                      )}
                        </>
                      )}
                      {ctrl.showPlusOne && (
                        <button
                          disabled={
                            c.is_completed ||
                            addBlocked ||
                            (ctrl.isDifferent && addedThisMatch)
                          }
                          onClick={() => increaseProgress(c, 1)}
                          title={
                            ctrl.isDifferent
                              ? "Suma 1 (máximo una vez por partida)"
                              : "Suma 1"
                          }
                          style={{
                            padding: `${fs(8, 12)} ${fs(14, 22)}`,
                            borderRadius: 8,
                            border: "none",
                            background: "#1c74e3",
                            color: "white",
                            cursor:
                              c.is_completed ||
                              addBlocked ||
                              (ctrl.isDifferent && addedThisMatch)
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              c.is_completed ||
                              addBlocked ||
                              (ctrl.isDifferent && addedThisMatch)
                                ? 0.5
                                : 1,
                            fontSize: fs(13, 19),
                            fontWeight: 700,
                          }}
                        >
                          +1
                        </button>
                      )}
                      {ctrl.showMinusOne && (
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
                      {ctrl.isDifferent && addedThisMatch && !c.is_completed && (
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
                      {matchBlocked &&
                        !ctrl.isOptionBased &&
                        !c.is_completed &&
                        (ctrl.showPlusOne || ctrl.showIncrementBulk) && (
                        <span style={{ color: "#fbbf24", fontSize: fs(12, 17) }}>
                          ⚠ Aumentar requiere partida activa
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </MissionRow>
            );
          })}
          {!weekMeta && items.length === 0 && (
            <p style={{ color: fnt.textDim, margin: 0, padding: `${fs(8, 14)} 0` }}>
              {onlyIncomplete
                ? "No quedan desafíos pendientes en esta semana."
                : "No hay desafíos para mostrar."}
            </p>
          )}
        </TrackerWeekAccordion>
          );
        })}

        {hasWeekFilter &&
          (query || onlyIncomplete) &&
          weekPanels.every(
            (p) => p.items.length === 0 && !p.meta
          ) && (
            <p style={{ color: "#9fc9f5", margin: 0 }}>
              {query
                ? `Ningún desafío coincide con "${search}".`
                : "No quedan desafíos pendientes en la selección actual."}
            </p>
          )}
      </section>
      </>
      )}
      </div>
    </main>
  );
}
