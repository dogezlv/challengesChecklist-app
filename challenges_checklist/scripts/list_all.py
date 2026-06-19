"""List all S8 normals and prestiges numbered."""
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


def main() -> None:
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    season = rest_get(base, key, "seasons?select=id&code=eq.season_8")[0]
    weeks = rest_get(
        base,
        key,
        f"challenge_weeks?select=id,week_number&season_id=eq.{season['id']}"
        f"&order=week_number.asc",
    )

    normals: list[dict] = []
    prestiges: list[dict] = []

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
        for r in rows:
            item = {**r, "week": wn}
            if r["is_prestige"]:
                prestiges.append(item)
            else:
                normals.append(item)

    print(f"=== DESAFÍOS NORMALES ({len(normals)}) ===")
    for i, r in enumerate(normals, 1):
        prog = fmt_progress(r["kind"], r["target_value"])
        print(f"{i}. [S{r['week']}] {r['description']} ({prog})")

    print()
    print(f"=== PRESTIGIOS ({len(prestiges)}) ===")
    prestiges.sort(key=lambda x: (x["week"], x["created_at"]))
    for i, r in enumerate(prestiges, 1):
        prog = fmt_progress(r["kind"], r["target_value"])
        print(f"{i}. [S{r['week']}] {r['description']} ({prog})")

    print(f"\nTotal normales: {len(normals)} | Total prestigios: {len(prestiges)}")


if __name__ == "__main__":
    main()
