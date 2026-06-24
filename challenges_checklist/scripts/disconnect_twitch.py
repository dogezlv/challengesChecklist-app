"""Delete all rows from twitch_tokens (disconnect Twitch OAuth)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
PROJECT_REF = "ucjuxngjmcdwggishima"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
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


def query(token: str, sql: str) -> list:
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
        method="POST",
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"HTTP {exc.code}: {exc.read().decode()}") from exc


def main() -> None:
    token = load_env(ENV_PATH).get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN missing in .env.local")

    before = query(
        token,
        "select broadcaster_id, broadcaster_login, broadcaster_name, updated_at "
        "from twitch_tokens",
    )
    print("before:", json.dumps(before, ensure_ascii=False))

    deleted = query(
        token,
        "delete from twitch_tokens "
        "returning broadcaster_id, broadcaster_login, broadcaster_name",
    )
    print("deleted:", json.dumps(deleted, ensure_ascii=False))

    verify = query(token, "select count(*)::int as n from twitch_tokens")
    print("remaining:", json.dumps(verify, ensure_ascii=False))


if __name__ == "__main__":
    main()
