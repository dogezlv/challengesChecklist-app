"""Verify S10 cannon prestige has 7 rules."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
MGMT_URL = "https://api.supabase.com/v1/projects/ucjuxngjmcdwggishima/database/query"
UA = "Mozilla/5.0"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def main() -> None:
    token = load_env(ENV_PATH).get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN missing")
    q = """
    select count(cr.id)::int as rule_count
    from challenge_rules cr
    join challenges c on c.id = cr.challenge_id
    join challenge_weeks w on w.id = c.week_id
    join seasons s on s.id = w.season_id
    where s.code = 'season_8' and w.week_number = 10 and c.is_prestige
      and c.description ilike '%campamentos piratas diferentes%'
    """
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": q}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        rows = json.load(resp)
    print("rule_count:", rows[0]["rule_count"] if rows else 0)


if __name__ == "__main__":
    main()
