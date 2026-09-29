#!/usr/bin/env python3
"""Fetch Notre Dame dining hall menus from Nutrislice and write data/menu.json.

Runs once a day from GitHub Actions, so the app never has to call Nutrislice
from a visitor's browser. Uses only the Python standard library.

If nothing can be fetched, the script exits with an error and leaves the
existing data/menu.json untouched.
"""

import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

API = "https://nd.api.nutrislice.com/menu/api"

# slug (as used in nd.nutrislice.com/menu/<slug>/...) -> display name.
# Add or remove halls here. The script prints every location Nutrislice
# lists, so you can copy the exact slug of any other dining hall.
HALLS = {
    "south-dining-hall": "South Dining Hall",
    "north-dining-hall": "North Dining Hall",
}

# Meal periods to try. Ones a hall doesn't serve are skipped automatically.
MEALS = ["breakfast", "brunch", "lunch", "late-lunch", "dinner"]

WEEKS_AHEAD = 2  # each request returns one week; fetch this many weeks
TIMEZONE = ZoneInfo("America/New_York")
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "menu.json"

SERVING_UNITS = {"z": "oz", "flz": "fl oz"}


def get_json(url, retries=3):
    """GET a URL and parse JSON. Returns None on 404, raises after retries."""
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "plate-planner/1.0 (personal project)",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            last_error = error
        except Exception as error:  # network hiccup, bad JSON, etc.
            last_error = error
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def to_number(value):
    """Round a nutrition value to one decimal, or None if missing."""
    if value is None:
        return None
    try:
        number = round(float(value), 1)
    except (TypeError, ValueError):
        return None
    return int(number) if number == int(number) else number


def format_serving(amount, unit, info):
    """Build a readable serving size like '4 oz' or '1 link'."""
    if amount not in (None, "") and unit:
        unit = SERVING_UNITS.get(str(unit).strip(), str(unit).strip())
        try:
            number = float(amount)
            amount = int(number) if number == int(number) else round(number, 2)
        except (TypeError, ValueError):
            pass
        return f"{amount} {unit}"
    if info:
        return str(info).strip()
    return ""


def normalize_week(week):
    """Turn a Nutrislice week response into {date: [item, ...]}.

    Returns (days, skipped) where skipped counts items with no nutrition data.
    """
    days = {}
    skipped = 0
    for day in week.get("days", []):
        date = day.get("date")
        if not date:
            continue

        menu_items = day.get("menu_items", [])
        station_names = {
            entry.get("station_id"): (entry.get("text") or "").strip()
            for entry in menu_items
            if entry.get("is_station_header") and entry.get("station_id") is not None
        }

        current_station = ""
        seen = set()
        items = []
        for entry in menu_items:
            if entry.get("is_station_header"):
                current_station = (entry.get("text") or "").strip()
                continue

            food = entry.get("food")
            if not food:
                continue

            nutrition = food.get("rounded_nutrition_info") or {}
            calories = to_number(nutrition.get("calories"))
            if calories is None:
                skipped += 1
                continue

            station = station_names.get(entry.get("station_id")) or current_station
            name = (food.get("name") or "").strip()
            if not name or (station, name) in seen:
                continue
            seen.add((station, name))

            items.append(
                {
                    "n": name,
                    "st": station,
                    "sv": format_serving(
                        entry.get("serving_size_amount") or food.get("serving_size_amount"),
                        entry.get("serving_size_unit") or food.get("serving_size_unit"),
                        entry.get("serving_size_info") or food.get("serving_size_info"),
                    ),
                    "cal": calories,
                    "p": to_number(nutrition.get("g_protein")) or 0,
                    "c": to_number(nutrition.get("g_carbs")) or 0,
                    "f": to_number(nutrition.get("g_fat")) or 0,
                    "fi": to_number(nutrition.get("g_fiber")) or 0,
                    "su": to_number(nutrition.get("g_sugar")) or 0,
                    "na": to_number(nutrition.get("mg_sodium")) or 0,
                }
            )

        if items:
            days[date] = items
    return days, skipped


def main():
    today = dt.datetime.now(TIMEZONE).date()

    try:
        schools = get_json(f"{API}/schools/")
        if schools:
            print("Locations Nutrislice lists for Notre Dame:")
            for school in schools:
                print(f"  {school.get('slug')}  ({school.get('name')})")
    except RuntimeError as error:
        print(f"Could not list locations (continuing): {error}")

    halls_out = {}
    total_items = 0

    for slug, display_name in HALLS.items():
        meals_out = {}
        for meal in MEALS:
            merged = {}
            skipped_total = 0
            for week_offset in range(WEEKS_AHEAD):
                day = today + dt.timedelta(days=7 * week_offset)
                url = (
                    f"{API}/weeks/school/{slug}/menu-type/{meal}/"
                    f"{day.year}/{day.month:02d}/{day.day:02d}/"
                )
                try:
                    week = get_json(url)
                except RuntimeError as error:
                    print(f"  ! {error}")
                    week = None
                time.sleep(0.3)  # be polite to the server
                if not week:
                    continue
                days, skipped = normalize_week(week)
                merged.update(days)
                skipped_total += skipped

            merged = {d: items for d, items in merged.items() if d >= today.isoformat()}
            if merged:
                meals_out[meal] = dict(sorted(merged.items()))
                count = sum(len(items) for items in merged.values())
                total_items += count
                print(f"{slug} / {meal}: {len(merged)} days, {count} items"
                      f" ({skipped_total} skipped without nutrition data)")
            else:
                print(f"{slug} / {meal}: no menu found")

        if meals_out:
            halls_out[slug] = {"name": display_name, "meals": meals_out}

    if total_items == 0:
        print("No menu items were fetched. Leaving existing data untouched.")
        return 1

    output = {
        "updated": dt.datetime.now(TIMEZONE).isoformat(timespec="minutes"),
        "source": "Nutrislice (nd.nutrislice.com)",
        "halls": halls_out,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_PATH} with {total_items} items.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
