"""Apply db/21 twitch betting migration."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
PROJECT_REF = "ucjuxngjmcdwggishima"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
SQL_PATH = Path(__file__).resolve().parents[1] / "db" / "21_twitch_betting.sql"

VERIFY_QUERY = """
select json_build_object(
  'betting_pools', exists(
    select 1 from information_schema.tables
    where table_schema='public' and table_name='betting_pools'
  ),
  'twitch_tokens', exists(
    select 1 from information_schema.tables
    where table_schema='public' and table_name='twitch_tokens'
  ),
  'fully_completed_prestige_at', exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='challenge_weeks'
      and column_name='fully_completed_prestige_at'
  ),
  'week_is_complete_fn', exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='week_is_complete'
  )
) as markers;
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


def run_query(token: str, query: str) -> object:
    body = json.dumps({"query": query}).encode()
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
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    env = load_env(ENV_PATH)
    token = env.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("ERROR: SUPABASE_ACCESS_TOKEN missing in .env.local")

    sql = SQL_PATH.read_text(encoding="utf-8")
    try:
        run_query(token, sql)
        result = run_query(token, VERIFY_QUERY)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"HTTP {exc.code}: {exc.read().decode()}") from exc

    print(json.dumps({"applied": "db/21", "verify": result}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
