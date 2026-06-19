"""Apply db/23 misc/volcano/jungle updates."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
PROJECT_REF = "ucjuxngjmcdwggishima"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
SQL_PATH = Path(__file__).resolve().parents[1] / "db" / "23_misc_volcano_jungle.sql"


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
    token = load_env(ENV_PATH).get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN missing")
    sql = SQL_PATH.read_text(encoding="utf-8")
    try:
        run_query(token, sql)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"HTTP {exc.code}: {exc.read().decode()}") from exc
    print("applied db/23")


if __name__ == "__main__":
    main()
