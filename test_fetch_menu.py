"""Run with: python3 -m unittest discover tests
Uses a small SYNTHETIC response shaped like Nutrislice's weekly menu API."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_menu  # noqa: E402

WEEK = {
    "days": [
        {"date": "2026-09-27", "menu_items": []},
        {
            "date": "2026-09-28",
            "menu_items": [
                {"is_station_header": True, "text": "Breakfast", "station_id": 1},
                {
                    "station_id": 1,
                    "serving_size_amount": "4",
                    "serving_size_unit": "z",
                    "food": {
                        "name": "Scrambled Eggs",
                        "rounded_nutrition_info": {
                            "calories": 161, "g_protein": 13, "g_carbs": 0, "g_fat": 13,
                            "g_fiber": 0, "g_sugar": 0, "mg_sodium": 190,
                        },
                    },
                },
                {
                    "station_id": 1,
                    "food": {
                        "name": "Scrambled Eggs",
                        "rounded_nutrition_info": {"calories": 161},
                    },
                },
                {"is_station_header": True, "text": "Yogurt", "station_id": 2},
                {
                    "station_id": 2,
                    "food": {"name": "Mystery Item", "rounded_nutrition_info": {"calories": None}},
                },
                {"station_id": 2, "is_section_title": True, "text": "Just a label", "food": None},
                {
                    "station_id": 2,
                    "food": {
                        "name": "Vanilla Yogurt",
                        "serving_size_info": "6 oz cup",
                        "rounded_nutrition_info": {"calories": 120.4, "g_protein": 10.26},
                    },
                },
            ],
        },
    ]
}


class NormalizeWeekTests(unittest.TestCase):
    def test_normalizes_items(self):
        days, skipped = fetch_menu.normalize_week(WEEK)
        self.assertEqual(list(days), ["2026-09-28"])  # empty day dropped
        self.assertEqual(skipped, 1)  # the item with no calories
        items = days["2026-09-28"]
        self.assertEqual([i["n"] for i in items], ["Scrambled Eggs", "Vanilla Yogurt"])

    def test_fields_and_units(self):
        items = fetch_menu.normalize_week(WEEK)[0]["2026-09-28"]
        eggs, yogurt = items
        self.assertEqual(eggs["st"], "Breakfast")
        self.assertEqual(eggs["sv"], "4 oz")
        self.assertEqual((eggs["cal"], eggs["p"], eggs["na"]), (161, 13, 190))
        self.assertEqual(yogurt["st"], "Yogurt")
        self.assertEqual(yogurt["sv"], "6 oz cup")
        self.assertEqual(yogurt["cal"], 120.4)
        self.assertEqual(yogurt["p"], 10.3)
        self.assertEqual(yogurt["c"], 0)  # missing values become 0


if __name__ == "__main__":
    unittest.main()
