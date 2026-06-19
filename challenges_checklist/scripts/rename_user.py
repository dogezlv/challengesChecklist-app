"""Rename auth user email prefix (login username). Usage: python rename_user.py old new"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
PROJECT_REF = "ucjuxngjmcdwggishima"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def run_query(token: str, sql: str) -> str:
    try:
        resp = urllib.request.urlopen(
            urllib.request.Request(
                MGMT_URL,
                data=json.dumps({"query": sql}).encode(),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0 Safari/537.36"
                    ),
                },
                method="POST",
            ),
            timeout=180,
        )
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"HTTP {exc.code}: {exc.read().decode()}") from exc
    return resp.read().decode()


def main() -> None:
    old = (sys.argv[1] if len(sys.argv) > 1 else "sebastian").lower().strip()
    new = (sys.argv[2] if len(sys.argv) > 2 else "dogez").lower().strip()
    old_email = f"{old}@checklist.local"
    new_email = f"{new}@checklist.local"

    token = load_env(ENV_PATH).get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN missing")

    sql = f"""
select id, email from auth.users where email = '{old_email}';

update auth.users
set
  email = '{new_email}',
  raw_user_meta_data = coalesce(raw_user_meta_data, '{{}}'::jsonb)
    || jsonb_build_object('email', '{new_email}')
where email = '{old_email}';

update auth.identities i
set identity_data = i.identity_data || jsonb_build_object('email', '{new_email}')
from auth.users u
where i.user_id = u.id and u.email = '{new_email}';

update public.tracker_activity_logs
set actor_name = '{new}'
where actor_name = '{old}';

select id, email from auth.users where email = '{new_email}';
"""
    print(run_query(token, sql))


if __name__ == "__main__":
    main()
