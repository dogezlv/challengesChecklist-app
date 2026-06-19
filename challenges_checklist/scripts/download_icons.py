"""Download Fortnite wiki icons into public/icons/<code>.png."""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
API = "https://fortnite.fandom.com/api.php"
UA = "ChallengesChecklistBot/1.0 (dev; icon fetch)"

# code -> wiki File: titles to try (first hit wins)
ICONS: dict[str, list[str]] = {
    "quad_crasher": [
        "Quadcrasher_-_Vehicle_-_Fortnite.png",
        "Quadcrasher.png",
    ],
    "driftboard": ["Driftboard.png", "Driftboard_-_Vehicle_-_Fortnite.png"],
    "camo_bush": [
        "Bush_-_Item_-_Fortnite.png",
        "Bush_-_Fortnite.png",
        "Bush.png",
    ],
    "slurp_juice": [
        "Slurp_Juice_-_Item_-_Fortnite.png",
        "Slurp_Juice_-_Consumable_-_Fortnite.png",
        "Slurp_Juice.png",
    ],
    "chug_jug": [
        "Chug_Jug_-_Item_-_Fortnite.png",
        "Chug_Jug_-_Consumable_-_Fortnite.png",
        "Chug_Jug.png",
    ],
    "shadow_bomb": [
        "Shadow_Bomb_-_Item_-_Fortnite.png",
        "Shadow_Bomb.png",
    ],
    "impulse_grenade": [
        "Impulse_Grenade_-_Item_-_Fortnite.png",
        "Impulse_Grenade.png",
    ],
    "volcano": [
        "Air_Vent_-_Device_-_Fortnite.png",
        "Volcano_Vent_-_Device_-_Fortnite.png",
        "Volcanic_Vent_-_Fortnite.png",
    ],
}


def wiki_image_url(file_title: str) -> str | None:
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "titles": f"File:{file_title}",
            "prop": "imageinfo",
            "iiprop": "url",
        }
    )
    req = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        if "missing" in page:
            continue
        infos = page.get("imageinfo") or []
        if infos and infos[0].get("url"):
            return infos[0]["url"]
    return None


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, str]] = []
    for code, titles in ICONS.items():
        dest = OUT / f"{code}.png"
        if dest.exists() and dest.stat().st_size > 500:
            results.append({"code": code, "status": "exists", "path": str(dest)})
            continue
        saved = False
        for title in titles:
            url = wiki_image_url(title)
            if not url:
                continue
            try:
                download(url, dest)
                if dest.stat().st_size > 200:
                    results.append(
                        {"code": code, "status": "ok", "file": title, "path": str(dest)}
                    )
                    saved = True
                    break
            except OSError:
                continue
        if not saved:
            results.append({"code": code, "status": "failed", "tried": titles})
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
