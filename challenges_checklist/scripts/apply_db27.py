"""Apply db/27 prestige fixes."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
MGMT_URL = "https://api.supabase.com/v1/projects/ucjuxngjmcdwggishima/database/query"
SQL_PATH = Path(__file__).resolve().parents[1] / "db" / "27_prestige_fixes.sql"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


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
    sql = SQL_PATH.read_text(encoding="utf-8")
    try:
        urllib.request.urlopen(
            urllib.request.Request(
                MGMT_URL,
                data=json.dumps({"query": sql}).encode(),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "User-Agent": UA,
                },
                method="POST",
            ),
            timeout=180,
        )
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"HTTP {exc.code}: {exc.read().decode()}") from exc
    print("applied db/27")


if __name__ == "__main__":
    main()
