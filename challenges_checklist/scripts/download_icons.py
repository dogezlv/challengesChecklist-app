"""Download Fortnite wiki icons into public/icons/<code>.png."""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
API = "https://fortnite.fandom.com/api.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0"

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
    "chug_splash": [
        "Chug_Splash_-_Item_-_Fortnite.png",
        "Chug_Splash_-_Consumable_-_Fortnite.png",
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
        "Volcano_Vent_-_Device_-_Fortnite.png",
        "Volcanic_Vent_-_Fortnite.png",
    ],
    "air_strike": ["Air_Strike_-_Item_-_Fortnite.png"],
    "air_vent": ["Air_Vent_-_Device_-_Fortnite.png"],
    "banana": ["Banana_-_Item_-_Fortnite.png"],
    "coconut": ["Coconut_-_Item_-_Fortnite.png"],
    "dynamite": ["Dynamite_-_Item_-_Fortnite.png"],
    "grenade": ["Grenade_-_Item_-_Fortnite.png"],
    "infinity_blade": ["Infinity_Blade_-_Weapon_-_Fortnite.png"],
    "loot_carrier": ["Loot_Carrier_-_Item_-_Fortnite.png"],
    "pepper": ["Pepper_-_Item_-_Fortnite.png"],
    "stink_bomb": ["Stink_Bomb_-_Item_-_Fortnite.png"],
    "storm_flip": ["Storm_Flip_-_Throwable_-_Fortnite.png"],
    "slipstream": [
        "Slipstream_-_Glider_-_Fortnite.png",
        "Neo_Tilted_(Slipstream_Station_1)_-_Location_-_Fortnite.png",
    ],
    "pirate_flag": ["Pirate_Flag_-_Decoration_-_LEGO_Fortnite.png"],
    "cactus": ["Cactus_-_Icon_-_Creative.png"],
    "metal_llama": ["Metal_Llama_-_Unnamed_Location_-_Fortnite.png"],
    "wooden_rabbit": [
        "Wooden_Rabbit_-_Unnamed_Location_-_Fortnite.webp",
        "Wooden_Rabbit_(S8)_-_Unnamed_Location_-_Fortnite_OG.png",
    ],
    "stone_pig": [
        "Stone_Pig_(S8)_-_Unnamed_Location_-_Fortnite_OG.png",
        "Stone_Pig_-_Unnamed_Location_-_Fortnite.webp",
    ],
    "giant_face": ["Giant_Face_(Desert)_-_Unnamed_Location_-_Fortnite.png"],
    "ice_sculpture": ["Ice_Sculptures_-_Unnamed_Location_-_Fortnite_OG.png"],
    "hot_spring": ["Hot_Springs_(S8)_-_Unnamed_Location_-_Fortnite_OG.png"],
    "dinosaur": ["Dino_Park_-_Unnamed_Location_-_Fortnite.png"],
    "treasure_signpost": [
        "Buried_Treasure_-_Item_-_Fortnite.png",
        "Treasure_Map_Magnifying_Glass_(Loading_Screen)_-_Fortnite.png",
    ],
    "jigsaw_piece": [
        "Jigsaw's_Challenge_(Reward)_-_Mechanic_-_Fortnite.png",
        "Jigsaw_-_Icon_-_Creative.png",
    ],
    "big_telephone": [
        "Telephone_-_Miscellaneous_-_Fortnite.png",
        "Big_Telephone_-_Miscellaneous_-_Fortnite.png",
    ],
}

# Sin icono fiable en la wiki; mantener emoji (FortniteIcon EMOJI_BY_CODE).
WIKI_SEARCH_SKIP = frozenset({"stone_pig"})

WIKI_SUFFIXES = (
    "_-_Item_-_Fortnite.png",
    "_-_Consumable_-_Fortnite.png",
    "_-_Device_-_Fortnite.png",
    "_-_Throwable_-_Fortnite.png",
    "_-_Vehicle_-_Fortnite.png",
    "_-_Weapon_-_Fortnite.png",
    "_-_Trap_-_Fortnite.png",
    ".png",
)


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


def wiki_search_files(query: str, limit: int = 8) -> list[str]:
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": query,
            "srnamespace": "6",
            "srlimit": str(limit),
        }
    )
    req = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    out: list[str] = []
    for hit in data.get("query", {}).get("search", []):
        title = hit.get("title", "")
        if title.startswith("File:"):
            title = title[5:]
        if re.search(r"\.(png|webp)$", title, re.I):
            out.append(title)
    return out


def auto_titles(code: str) -> list[str]:
    words = [w.capitalize() for w in code.split("_")]
    bases = ["_".join(words)]
    if code == "the_baller":
        bases.append("The_Baller")
    titles: list[str] = []
    for base in bases:
        for suffix in WIKI_SUFFIXES:
            titles.append(f"{base}{suffix}")
    return titles


def load_game_object_codes() -> list[str]:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return sorted(ICONS.keys())
    env: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    base = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        return sorted(ICONS.keys())
    url = f"{base.rstrip('/')}/rest/v1/game_objects?select=code&order=code"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        rows = json.loads(resp.read().decode())
    return [r["code"] for r in rows]


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def resolve_titles(code: str, *, allow_search: bool) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    def add(items: list[str]) -> None:
        for item in items:
            if item not in seen:
                seen.add(item)
                ordered.append(item)

    add(ICONS.get(code, []))
    add(auto_titles(code))
    if allow_search and code not in WIKI_SEARCH_SKIP:
        label = code.replace("_", " ").title()
        add(wiki_search_files(f"{label} Item Fortnite"))
        add(wiki_search_files(f"{label} Fortnite png"))
    return ordered


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    codes = load_game_object_codes()
    results: list[dict[str, object]] = []

    for code in codes:
        dest = OUT / f"{code}.png"
        if dest.exists() and dest.stat().st_size > 500:
            results.append({"code": code, "status": "exists"})
            continue

        saved = False
        tried: list[str] = []
        for allow_search in (False, True):
            if saved:
                break
            for title in resolve_titles(code, allow_search=allow_search):
                tried.append(title)
                url = wiki_image_url(title)
                if not url:
                    continue
                try:
                    download(url, dest)
                    if dest.stat().st_size > 200:
                        results.append(
                            {
                                "code": code,
                                "status": "ok",
                                "file": title,
                                "bytes": dest.stat().st_size,
                            }
                        )
                        saved = True
                        break
                except OSError:
                    if dest.exists():
                        dest.unlink(missing_ok=True)
                    continue

        if not saved:
            results.append({"code": code, "status": "failed", "tried": tried[:12]})

    ok = sum(1 for r in results if r["status"] == "ok")
    exists = sum(1 for r in results if r["status"] == "exists")
    failed = [r["code"] for r in results if r["status"] == "failed"]
    print(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nSummary: {ok} downloaded, {exists} already present, {len(failed)} failed", file=sys.stderr)
    if failed:
        print("Failed:", ", ".join(failed), file=sys.stderr)


if __name__ == "__main__":
    main()
