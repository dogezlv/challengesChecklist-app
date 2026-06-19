"""Verify db/19 markers via Supabase REST (service role) or Management API."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
PROJECT_REF = "ucjuxngjmcdwggishima"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

MGMT_QUERY = """
select json_build_object(
  'rule_group_column', exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='challenge_rules' and column_name='rule_group'
  ),
  'chug_jug_object', exists(select 1 from game_objects where code='chug_jug'),
  'chug_jug_effect', exists(
    select 1 from object_effects oe join game_objects o on o.id=oe.object_id
    where o.code='chug_jug' and oe.trigger_action='use' and oe.effect_action='gain'
  ),
  'within_10s_condition', exists(
    select 1 from rule_conditions where condition_key='within_10s_landing'
  ),
  'win_match_condition', exists(
    select 1 from rule_conditions where condition_key='win_match'
  ),
  'no_damage_between', exists(
    select 1 from rule_conditions where condition_key='no_damage_between'
  ),
  'no_named_chests', exists(
    select 1 from rule_conditions where condition_key='no_named_chests'
  ),
  'cardinal_prestige', exists(
    select 1 from challenges c
    join challenge_weeks w on w.id=c.week_id
    join seasons s on s.id=w.season_id
    where s.code='season_8' and c.is_prestige
      and c.description ilike '%puntos cardinales opuestos%'
  ),
  'prestige_count_s8', (
    select count(*)::int from challenges c
    join challenge_weeks w on w.id=c.week_id
    join seasons s on s.id=w.season_id
    where s.code='season_8' and c.is_prestige
  ),
  'latest_migration_expected', 19,
  'seasons', (
    select coalesce(json_agg(json_build_object('code', code, 'is_locked', is_locked) order by code), '[]'::json)
    from seasons
  )
) as db19_check;
"""


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def rest_get(base: str, key: str, path: str) -> list:
    url = f"{base.rstrip('/')}/rest/v1/{path}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def check_via_rest(env: dict[str, str]) -> dict:
    base = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise SystemExit("ERROR: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    chug = rest_get(base, key, "game_objects?select=code&code=eq.chug_jug")
    conditions = rest_get(
        base,
        key,
        "rule_conditions?select=condition_key&condition_key=in.(within_10s_landing,win_match,no_damage_between,no_named_chests)",
    )
    cond_keys = {row["condition_key"] for row in conditions}
    prestige = rest_get(
        base,
        key,
        "challenges?select=description,is_prestige&is_prestige=eq.true&description=ilike.*puntos%20cardinales%20opuestos*",
    )
    prestige_all = rest_get(
        base,
        key,
        "challenges?select=id&is_prestige=eq.true",
    )
    seasons = rest_get(base, key, "seasons?select=code,is_locked&order=code")

    # rule_group: probe one row (column absent => PostgREST error)
    rule_group_ok = False
    try:
        rest_get(base, key, "challenge_rules?select=rule_group&limit=1")
        rule_group_ok = True
    except urllib.error.HTTPError:
        rule_group_ok = False

    return {
        "source": "rest_api",
        "rule_group_column": rule_group_ok,
        "chug_jug_object": len(chug) > 0,
        "within_10s_condition": "within_10s_landing" in cond_keys,
        "win_match_condition": "win_match" in cond_keys,
        "no_damage_between": "no_damage_between" in cond_keys,
        "no_named_chests": "no_named_chests" in cond_keys,
        "cardinal_prestige": len(prestige) > 0,
        "prestige_count_all": len(prestige_all),
        "seasons": seasons,
        "db19_likely_applied": rule_group_ok
        and len(chug) > 0
        and "within_10s_landing" in cond_keys
        and len(prestige) > 0,
    }


def check_via_mgmt(token: str) -> dict:
    body = json.dumps({"query": MGMT_QUERY}).encode()
    req = urllib.request.Request(
        MGMT_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "challenges-checklist-dev/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode())
    row = rows[0]["db19_check"] if rows else {}
    row["source"] = "management_api"
    markers = [
        row.get("rule_group_column"),
        row.get("chug_jug_object"),
        row.get("within_10s_condition"),
        row.get("cardinal_prestige"),
    ]
    row["db19_likely_applied"] = all(markers)
    return row


def main() -> None:
    env = load_env(ENV_PATH)
    token = env.get("SUPABASE_ACCESS_TOKEN")

    if token:
        try:
            result = check_via_mgmt(token)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return
        except urllib.error.HTTPError as exc:
            print(
                json.dumps(
                    {
                        "management_api_error": f"HTTP {exc.code}",
                        "fallback": "rest_api",
                    }
                )
            )

    result = check_via_rest(env)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
