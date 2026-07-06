import json
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

from sync_ancestor import (  # noqa: E402
    FAMILY_OVERRIDES,
    build_spouse,
    build_waypoint,
    find_occupation,
)

FIXTURES = Path(__file__).parent / "fixtures"


class TestBuildWaypoint(unittest.TestCase):
    def test_maps_journey_fields(self):
        raw = {
            "seq": 1,
            "place": {"raw": "Philadelphia", "lat": 39.95, "lng": -75.16},
            "date": {"raw": "c. 1706", "year": 1706},
            "event": "birth",
            "narrative": "Born in the colony.",
            "confidence": "documented",
        }
        wp = build_waypoint(raw)
        self.assertEqual(wp["place"], "Philadelphia")
        self.assertEqual(wp["year"], 1706)
        self.assertEqual(wp["confidence"], "documented")


class TestFindOccupation(unittest.TestCase):
    def test_returns_occupation_event(self):
        person = {
            "manual": {
                "events": [
                    {"type": "other", "value": "ignored"},
                    {"type": "occupation", "value": "shoemaker", "confidence": "documented"},
                ]
            }
        }
        occ = find_occupation(person)
        self.assertEqual(occ, {"value": "shoemaker", "confidence": "documented"})

    def test_returns_none_when_missing(self):
        self.assertIsNone(find_occupation({}))


class TestBuildSpouse(unittest.TestCase):
    def test_prefers_journey_marriage_waypoint(self):
        person = json.loads((FIXTURES / "person_with_spouse.json").read_text())
        waypoints = json.loads((FIXTURES / "journey_with_marriage.json").read_text())["waypoints"]
        anc = FIXTURES
        spouse = build_spouse(person, anc, waypoints)
        self.assertEqual(spouse["marriageYear"], 1728)
        self.assertEqual(spouse["marriagePlace"], "Haddonfield Meeting")


class TestFamilyOverrides(unittest.TestCase):
    def test_josiah_override_has_children(self):
        override = FAMILY_OVERRIDES["I182197770339"]
        self.assertEqual(len(override["children"]), 9)
        self.assertEqual(override["childrenConfidence"], "documented")


if __name__ == "__main__":
    unittest.main()
