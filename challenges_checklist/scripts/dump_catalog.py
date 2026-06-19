"""Dump catalog (action_types, tags, game_objects, locations, object_effects)
and current S8 prestige challenges per week."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def rest_get(base: str, key: str, path: str) -> list:
    url = f"{base.rstrip('/')}/rest/v1/{path}"
    req = urllib.request.Request(
        url,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    key = env["SUPABASE_SERVICE_ROLE_KEY"]

    print("=== ACTION_TYPES ===")
    for r in rest_get(base, key, "action_types?select=code,display_name&order=code"):
        print(f"  {r['code']:<22} {r['display_name']}")

    print("\n=== TAGS ===")
    for r in rest_get(base, key, "tags?select=code,display_name,is_weapon&order=code"):
        w = " [arma]" if r.get("is_weapon") else ""
        print(f"  {r['code']:<22} {r['display_name']}{w}")

    print("\n=== GAME_OBJECTS ===")
    for r in rest_get(base, key, "game_objects?select=code,display_name,is_weapon&order=code"):
        w = " [arma]" if r.get("is_weapon") else ""
        print(f"  {r['code']:<26} {r['display_name']}{w}")

    print("\n=== LOCATIONS ===")
    for r in rest_get(base, key, "locations?select=code,display_name,named_location&order=code"):
        nm = "N" if r.get("named_location") else " "
        print(f"  [{nm}] {r['code']:<26} {r['display_name']}")

    print("\n=== OBJECT_EFFECTS ===")
    for r in rest_get(base, key, "object_effects?select=object_id,trigger_action,effect_action,amount_per_use"):
        print(f"  {r}")

    season = rest_get(base, key, "seasons?select=id&code=eq.season_8")[0]
    weeks = rest_get(
        base, key,
        f"challenge_weeks?select=id,week_number&season_id=eq.{season['id']}&order=week_number.asc",
    )
    print("\n=== PRESTIGIOS ACTUALES (S8) ===")
    for w in weeks:
        rows = rest_get(
            base, key,
            f"challenges?select=id,description,kind,unit,match_scope,target_value,rules_operator,"
            f"challenge_rules(id,rule_group,action_type:action_types(code),"
            f"required_object:game_objects!challenge_rules_required_object_id_fkey(code),"
            f"required_tag:tags!challenge_rules_required_tag_id_fkey(code),"
            f"target_object:game_objects!challenge_rules_target_object_id_fkey(code),"
            f"target_tag:tags!challenge_rules_target_tag_id_fkey(code),"
            f"location:locations!challenge_rules_location_id_fkey(code),"
            f"rule_conditions(condition_key,condition_value))"
            f"&week_id=eq.{w['id']}&is_meta=eq.false&is_prestige=eq.true&order=created_at.asc",
        )
        print(f"\n--- SEMANA {w['week_number']} ({len(rows)}) ---")
        for c in rows:
            print(f"  • {c['description']} [{c['kind']}/{c['unit']}/{c['match_scope']} {c['target_value']} op={c['rules_operator']}]")
            for r in c.get("challenge_rules", []):
                parts = [f"act={r['action_type']['code'] if r['action_type'] else None}"]
                for fld in ("required_object", "required_tag", "target_object", "target_tag", "location"):
                    if r.get(fld):
                        parts.append(f"{fld}={r[fld]['code']}")
                if r.get("rule_group") is not None:
                    parts.append(f"grp={r['rule_group']}")
                conds = [rc["condition_key"] for rc in r.get("rule_conditions", [])]
                if conds:
                    parts.append(f"cond={conds}")
                print(f"      - {' '.join(parts)}")


if __name__ == "__main__":
    main()
