"""List normals and prestiges W3-10 as separate lists per week."""
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
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def fmt_progress(kind: str, target: int) -> str:
    if kind == "simple":
        return "0/1"
    return f"0/{target}"


def print_list(label: str, rows: list[dict], start: int) -> int:
    print(f"  {label} ({len(rows)})")
    print(f"  {'─' * 100}")
    n = start
    for r in rows:
        prog = fmt_progress(r["kind"], r["target_value"])
        print(f"  {n:>3}  {prog:>6}  {r['description']}")
        n += 1
    return n


def main() -> None:
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    season = rest_get(base, key, "seasons?select=id&code=eq.season_8")[0]
    weeks = rest_get(
        base,
        key,
        f"challenge_weeks?select=id,week_number&season_id=eq.{season['id']}"
        f"&week_number=gte.3&week_number=lte.10&order=week_number.asc",
    )

    n = 1
    for w in weeks:
        wn, wid = w["week_number"], w["id"]
        rows = rest_get(
            base,
            key,
            f"challenges?select=id,description,is_prestige,kind,unit,target_value,"
            f"line_id,phase_order,created_at"
            f"&week_id=eq.{wid}&is_meta=eq.false"
            f"&order=is_prestige.asc,line_id.asc.nullslast,phase_order.asc.nullslast,created_at.asc",
        )
        normals = [r for r in rows if not r["is_prestige"]]
        prestiges = [r for r in rows if r["is_prestige"]]

        print(f"\n{'═' * 104}")
        print(f"  SEMANA {wn}")
        print(f"{'═' * 104}")
        n = print_list("Normales", normals, n)
        print()
        n = print_list("Prestigio", prestiges, n)


if __name__ == "__main__":
    main()
