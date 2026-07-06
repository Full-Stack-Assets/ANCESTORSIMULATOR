#!/usr/bin/env python3
"""Sync one ancestor's data from an ANC repo checkout into a game-ready JS module.

Reads data/people/{id}.json and data/journeys/{id}.json from an ANC checkout and
emits src/data/{slug}.js: a plain JS object the game imports directly (no fetch,
no build step, works from file:// or any static server).

Usage:
    python3 tools/sync_ancestor.py --anc /path/to/ANC --id I182197770339 --slug josiah
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def build_waypoint(w: dict) -> dict:
    return {
        "seq": w["seq"],
        "place": w["place"]["raw"],
        "lat": w["place"].get("lat"),
        "lng": w["place"].get("lng"),
        "date": w["date"]["raw"] if w.get("date") else None,
        "year": w["date"]["year"] if w.get("date") else None,
        "event": w["event"],
        "narrative": w.get("narrative"),
        "confidence": w["confidence"],
    }


def find_occupation(person: dict) -> dict | None:
    """Pull an occupation from person.manual.events, if the research recorded one."""
    for ev in person.get("manual", {}).get("events", []):
        if ev.get("type") == "occupation" and ev.get("value"):
            return {"value": ev["value"], "confidence": ev.get("confidence", "documented")}
    return None


def build_spouse(person: dict, anc: Path, waypoints: list[dict]) -> dict | None:
    """Resolve the first spouse to a small summary, if their record exists.

    Marriage year/place prefer a matching journey waypoint (event containing
    "marriage") over the person record's raw structured field: the journey
    carries corrections the raw export doesn't (e.g. a marriage date the
    research disproved), same principle as the birth/death year handling."""
    spouses = person.get("relationships", {}).get("spouses", [])
    if not spouses:
        return None
    sp = spouses[0]
    marriage = sp.get("marriage") or {}
    spouse_path = anc / "data" / "people" / f"{sp['id']}.json"
    if not spouse_path.exists():
        return None
    spouse = json.loads(spouse_path.read_text())
    sv = spouse.get("vitals", {})

    marriage_wp = next((w for w in waypoints if "marriage" in w["event"].lower()), None)
    if marriage_wp:
        marriage_year = marriage_wp["date"]["year"] if marriage_wp.get("date") else None
        marriage_place = marriage_wp["place"]["raw"]
    else:
        marriage_year = (marriage.get("date") or {}).get("year")
        marriage_place = (marriage.get("place") or {}).get("raw")

    return {
        "name": spouse["name"]["full"],
        "birthYear": ((sv.get("birth") or {}).get("date") or {}).get("year"),
        "deathYear": ((sv.get("death") or {}).get("date") or {}).get("year"),
        "marriageYear": marriage_year,
        "marriagePlace": marriage_place,
        "confidence": spouse.get("confidence", "inferred"),
    }


# Hand-verified family summaries too granular to live as linked person records
# in the ANC export (most are named only in a researched prose note, not as
# separate GEDCOM individuals). Each entry is lifted verbatim from that
# person's data/people/{id}.json manual.notes — same citations, just
# restructured for display. Keyed by ANC id; harmless no-op for ancestors
# without an entry.
FAMILY_OVERRIDES = {
    "I182197770339": {
        "legacyNote": (
            "He left the Otter Branch plantation, and the brick homestead he built in 1743, to his "
            "grandson John — and the land still carries the family's name today, in the New Jersey "
            "locality of Albertson. Six generations later, his line reaches you."
        ),
        "childrenNote": (
            "Nine children, per Clement (1877) pp. 106-108 and Prowell (1886) p. 674, "
            "cross-checked against wills and Haddonfield Meeting minutes."
        ),
        "children": [
            {"name": "Hannah", "fate": "m. Jacob Clement, 1747"},
            {"name": "Mary", "fate": "m. Thomas Hackney (her 1779 will names ‘my father Josiah Alberson’)"},
            {"name": "Cassandra", "fate": "m. Jacob Ellis 1750, then Jacob Burrough"},
            {"name": "Patience", "fate": "m. Isaac Ballinger"},
            {"name": "Elizabeth", "fate": "died unmarried"},
            {"name": "Josiah Jr.", "fate": "m. Eleanor Tomlinson, then Judith Boggs; died winter 1782/83, predeceasing his father"},
            {"name": "Sarah", "fate": "m. Samuel Webster"},
            {"name": "Keturah", "fate": "m. Isaac Townsend"},
            {"name": "Ann", "fate": "m. Ebenezer Hopkins, then Jacob Jennings"},
        ],
        "childrenConfidence": "documented",
    },
    "I182197776810": {
        "legacyNote": (
            "The Irish Quaker who crossed an ocean left seven children, two mills on the Poquessing, "
            "and a family that stayed on the land he settled for generations — including the son of the "
            "next chapter, and eventually you."
        ),
        "familyNote": (
            "Two wives, two families. Jane (Preston) died before 1695; William married the widow "
            "Hannah Drewett within the next year or two."
        ),
        "childrenNote": (
            "Per William's will (7 Dec 1709, proved 17 Jan 1709/10) and the WikiTree Quakers Project "
            "profile (Alberson-96)."
        ),
        "children": [
            {"name": "William Jr.", "fate": "by Jane Preston — m. Esther Willis (Long Island) 1695; inherited the Newton homestead; West Jersey Assemblyman"},
            {"name": "Abraham", "fate": "by Jane Preston — m. Hannah Medcalf; received the 1692 Gloucester-bounds tract"},
            {"name": "Rebecca", "fate": "by Jane Preston — m. Joseph Satterthwaite"},
            {"name": "Ann", "fate": "by Jane Preston — m. (1) Walter Forrest of Byberry Mill 1686, (2) John Kaighn c. 1694; predeceased her father"},
            {"name": "Benjamin", "fate": "by Hannah Drewett — m. Sarah Walton, 1724, Abington Meeting"},
            {"name": "Cassandra", "fate": "by Hannah Drewett — m. her step-brother Jarvis Stockdale"},
            {"name": "Josiah", "fate": "by Hannah Drewett — the ancestor of the previous chapter"},
        ],
        "childrenConfidence": "documented",
    },
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--anc", required=True, help="path to an ANC repo checkout")
    ap.add_argument("--id", required=True, help="GEDCOM id, e.g. I182197770339")
    ap.add_argument("--slug", required=True, help="output slug, e.g. josiah")
    args = ap.parse_args()

    anc = Path(args.anc)
    person_path = anc / "data" / "people" / f"{args.id}.json"
    journey_path = anc / "data" / "journeys" / f"{args.id}.json"
    if not person_path.exists():
        raise FileNotFoundError(f"person record not found: {person_path}")
    if not journey_path.exists():
        raise FileNotFoundError(f"journey record not found: {journey_path}")

    person = json.loads(person_path.read_text(encoding="utf-8"))
    journey = json.loads(journey_path.read_text(encoding="utf-8"))

    # Prefer the reviewed journey's own birth/death waypoints over the raw machine
    # vitals: the journey carries corrections (e.g. a birth year the research
    # disproved), and the game should tell the corrected story, not the export.
    waypoints = journey["waypoints"]
    birth_wp = next((w for w in waypoints if w["event"] == "birth"), None)
    death_wp = next((w for w in waypoints if w["event"] == "death"), None)
    vitals = person.get("vitals", {})
    birth_year = ((birth_wp or {}).get("date") or {}).get("year") if birth_wp else (
        (vitals.get("birth") or {}).get("date") or {}).get("year")
    death_year = ((death_wp or {}).get("date") or {}).get("year") if death_wp else (
        (vitals.get("death") or {}).get("date") or {}).get("year")

    family_override = FAMILY_OVERRIDES.get(args.id, {})
    out = {
        "id": args.id,
        "name": person["name"]["full"],
        "birthYear": birth_year,
        "deathYear": death_year,
        "summary": journey.get("summary"),
        "journeyStatus": journey.get("status"),
        "waypoints": [build_waypoint(w) for w in journey["waypoints"]],
        "occupation": find_occupation(person),
        "spouse": build_spouse(person, anc, waypoints),
        "legacyNote": family_override.get("legacyNote"),
        "familyNote": family_override.get("familyNote"),
        "children": family_override.get("children", []),
        "childrenNote": family_override.get("childrenNote"),
        "childrenConfidence": family_override.get("childrenConfidence"),
    }

    out_dir = Path(__file__).resolve().parent.parent / "src" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{args.slug}.js"
    js = (
        f"// Generated by tools/sync_ancestor.py from ANC data/people/{args.id}.json\n"
        f"// and data/journeys/{args.id}.json. Do not hand-edit — re-run the sync script\n"
        f"// after the source records change.\n"
        f"export const {args.slug.upper()} = {json.dumps(out, indent=2, ensure_ascii=False)};\n"
    )
    out_path.write_text(js, encoding="utf-8")
    print(f"wrote {out_path} ({len(out['waypoints'])} waypoints)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
