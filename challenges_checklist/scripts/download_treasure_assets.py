"""Download treasure map / loading screen images into public/treasure/."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "treasure"
API = "https://fortnite.fandom.com/api.php"
UA = "ChallengesChecklistBot/1.0 (dev; treasure asset fetch)"

ASSETS: dict[str, list[str]] = {
    "loading_magnify.jpg": [
        "Isle_Of_Treasure_(Full)_-_Loading_Screen_-_Fortnite.png",
        "Isle_of_Treasure_-_Loading_Screen_-_Fortnite.png",
    ],
    "loading_knife.jpg": [
        "Isle_Of_Treasure_(Full)_-_Loading_Screen_-_Fortnite.png",
        "Isle_of_Treasure_-_Loading_Screen_-_Fortnite.png",
    ],
    "map_1_arctic_airport.png": [
        "Treasure_Map_-_Frosty_Flights_-_Fortnite.png",
        "Treasure_Map_Frosty_Flights.png",
        "Paradise_Palms_Treasure_Map.png",
        "Treasure_Map_-_Paradise_Palms_-_Fortnite.png",
    ],
    "map_2_forknife.png": [
        "Treasure_Map_-_Junk_Junction_-_Fortnite.png",
        "Treasure_Map_Junk_Junction.png",
        "Junk_Junction_Treasure_Map.png",
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
        data = json.load(resp)
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info = page.get("imageinfo")
        if info:
            return info[0].get("url")
    return None


def download(name: str, titles: list[str]) -> bool:
    dest = OUT / name
    for title in titles:
        url = wiki_image_url(title)
        if not url:
            continue
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            dest.write_bytes(resp.read())
        print(f"ok {name} <- {title}")
        return True
    print(f"skip {name} (no wiki hit)")
    return False


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, titles in ASSETS.items():
        download(name, titles)

    fork_dest = OUT / "map_2_forknife.png"
    if not fork_dest.is_file():
        download("map_2_forknife.png", ASSETS["map_2_forknife.png"])


if __name__ == "__main__":
    main()
