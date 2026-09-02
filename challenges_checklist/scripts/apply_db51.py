"""Apply db/51 S9 truck monster location fix."""
from apply_db41 import ENV_PATH, MGMT_URL, load_env
import json
import urllib.request
from pathlib import Path

SQL = (Path(__file__).resolve().parents[1] / "db" / "51_s9_truck_monster.sql").read_text(
    encoding="utf-8"
)


def main() -> None:
    token = load_env(ENV_PATH).get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN missing")
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": SQL}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 Chrome/124.0",
        },
        method="POST",
    )
    print(urllib.request.urlopen(req, timeout=120).read().decode()[:500])


if __name__ == "__main__":
    main()
