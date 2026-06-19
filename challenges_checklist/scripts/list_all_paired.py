"""List all S8 normals paired with prestige (side-by-side)."""
from __future__ import annotations

import json
import sys
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


def fmt(r: dict) -> str:
    if r["kind"] == "simple":
        return "0/1" if not r.get("is_completed") else "1/1"
    cur = r.get("current_value") or 0
    tgt = r.get("target_value") or 0
    return f"{cur}/{tgt}"


def main() -> None:
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    svc = env["SUPABASE_SERVICE_ROLE_KEY"]
    season = rest_get(base, svc, "seasons?select=id&code=eq.season_8")[0]
    weeks = rest_get(
        base,
        svc,
        f"challenge_weeks?select=id,week_number&season_id=eq.{season['id']}"
        f"&order=week_number.asc",
    )

    n = 1
    weeks_out: list[dict] = []

    for w in weeks:
        wn, wid = w["week_number"], w["id"]
        rows = rest_get(
            base,
            svc,
            f"challenges?select=id,description,is_prestige,kind,unit,target_value,"
            f"current_value,is_completed,line_id,phase_order,created_at"
            f"&week_id=eq.{wid}&is_meta=eq.false"
            f"&order=is_prestige.asc,line_id.asc.nullslast,phase_order.asc.nullslast,created_at.asc",
        )
        normals = [r for r in rows if not r["is_prestige"]]
        prestiges = [r for r in rows if r["is_prestige"]]

        unit_ids: list[str] = []
        seen: set[str] = set()
        for r in sorted(
            normals,
            key=lambda x: (str(x["line_id"] or x["id"]), -(x["phase_order"] or 0)),
        ):
            uid = r["line_id"] or r["id"]
            if uid in seen:
                continue
            seen.add(uid)
            unit_ids.append(uid)
        uid_to_prest = {uid: i for i, uid in enumerate(unit_ids)}
        prestiges.sort(key=lambda x: x["created_at"])

        print(f"\n{'═' * 120}")
        print(f"  SEMANA {wn}")
        print(f"{'═' * 120}")
        print(f"  #  Normal{' ' * 46} Prog  │  Prestigio{' ' * 43} Prog")
        print(f"{'─' * 120}")

        week_rows: list[dict] = []
        for r in normals:
            uid = r["line_id"] or r["id"]
            idx = uid_to_prest.get(uid)
            if idx is not None and idx < len(prestiges):
                p = prestiges[idx]
                prest_desc = p["description"]
                prest_prog = fmt(p)
            else:
                prest_desc = "—"
                prest_prog = ""

            nd = r["description"]
            nprog = fmt(r)
            print(f"{n:>3}  {nd[:52]:<52} {nprog:>5}  │  {prest_desc[:52]:<52} {prest_prog:>5}")
            week_rows.append(
                {
                    "num": n,
                    "normal": nd,
                    "normalProg": nprog,
                    "prestige": prest_desc,
                    "prestigeProg": prest_prog,
                }
            )
            n += 1
        weeks_out.append({"week": wn, "rows": week_rows})

    print(f"\n{'═' * 120}")
    print(f"  Total: {n - 1} normales")
    print(f"{'═' * 120}")

    if "--json" in sys.argv:
        out = Path(__file__).resolve().parent / "challenges_paired.json"
        out.write_text(json.dumps(weeks_out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON → {out}")


if __name__ == "__main__":
    main()
