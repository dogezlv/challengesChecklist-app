"""Apply db/20 and verify prestige W1 text changes."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
PROJECT_REF = "ucjuxngjmcdwggishima"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
SQL_PATH = Path(__file__).resolve().parents[1] / "db" / "20_prestige_w1_text.sql"

VERIFY_QUERY = """
select json_agg(json_build_object(
  'description', c.description,
  'target', c.target_value,
  'match_scope', c.match_scope,
  'rules', (
    select coalesce(json_agg(t.display_name order by t.display_name), '[]'::json)
    from challenge_rules cr
    left join tags t on t.id = cr.required_tag_id
    where cr.challenge_id = c.id
  )
) order by c.description) as w1_prestige
from challenges c
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
where s.code = 'season_8' and w.week_number = 1 and c.is_prestige
  and (
    c.description ilike '%arma explosiva y una escopeta%'
    or c.description ilike '%fusil de asalto y un fusil de francotirador%'
  );
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
    with urllib.request.urlopen(req, timeout=60) as resp:
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

    print(json.dumps({"applied": "db/20", "verify": result}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
