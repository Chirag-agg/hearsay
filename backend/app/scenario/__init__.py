"""Scenario data (hollowmere.json) and the loader that builds the tpl_* graphs."""

import json
from pathlib import Path

SCENARIO_DIR = Path(__file__).parent
PREDS = {"WAS_AT", "LEFT", "CARRIED", "ARGUED_WITH", "THREATENED", "OWES", "SAW"}
ORIGINS = {"witnessed", "heard", "lie"}


_NOUNS = {("m", True): "man", ("f", True): "woman", ("m", False): "boy", ("f", False): "girl"}


def desc_id(sex: str, adult: bool, carrying: str | None = None) -> str:
    """Descriptions are named by their attributes ("a man with a lantern" = d_man_lantern), so the
    gossip engine can blur a name into a description, or change one attribute, without a lookup."""
    return f"d_{_NOUNS[(sex, adult)]}" + (f"_{carrying}" if carrying else "")


def desc_attrs(description_id: str) -> dict:
    noun, _, carrying = description_id.removeprefix("d_").partition("_")
    sex, adult = next(k for k, v in _NOUNS.items() if v == noun)
    text = f"a {noun}" + (f" with a {carrying}" if carrying else "")
    return {"id": description_id, "text": text, "sex": sex, "adult": adult, "carrying": carrying or None}


def load_scenario(name: str = "hollowmere") -> dict:
    scenario = json.loads((SCENARIO_DIR / f"{name}.json").read_text(encoding="utf-8"))
    validate(scenario)
    return scenario


def validate(s: dict) -> None:
    """Fail loudly on dangling ids, so a typo in the JSON never becomes a silently missing edge."""
    places = {p["id"] for p in s["places"]}
    objects = {o["id"] for o in s["objects"]}
    descriptions = {d["id"] for d in s["descriptions"]}
    people = {s["victim"]["id"], *(v["id"] for v in s["villagers"])}
    errors: list[str] = []

    def check(ref, allowed, what):
        if ref is not None and ref not in allowed:
            errors.append(f"{what}: unknown id {ref!r}")

    for d in s["descriptions"]:
        if d["id"] != desc_id(d["sex"], d["adult"], d.get("carrying")) or d["text"] != desc_attrs(d["id"])["text"]:
            errors.append(f"description {d['id']!r} doesn't follow the d_<noun>[_<carrying>] scheme")
    for r in s["roads"]:
        check(r["a"], places, "road")
        check(r["b"], places, "road")
    for k in s["knows"]:
        check(k["a"], people, "knows")
        check(k["b"], people, "knows")

    claim_ids: set[str] = set()
    for v in s["villagers"]:
        check(v.get("lives_at"), places, f"{v['id']}.lives_at")
        check(v.get("works_at"), places, f"{v['id']}.works_at")
        for c in v["claims"]:
            where = f"{v['id']}.{c['id']}"
            if c["id"] in claim_ids:
                errors.append(f"{where}: duplicate claim id")
            claim_ids.add(c["id"])
            if c["pred"] not in PREDS:
                errors.append(f"{where}: unknown pred {c['pred']!r}")
            if c["origin"] not in ORIGINS:
                errors.append(f"{where}: unknown origin {c['origin']!r}")
            if not c["t_from"] < c["t_to"]:
                errors.append(f"{where}: empty time window")
            if c.get("toward_id") and c["pred"] != "LEFT":
                errors.append(f"{where}: toward_id is only for LEFT")
            if (c["origin"] == "heard") != ("heard_from" in c):
                errors.append(f"{where}: heard claims, and only they, need heard_from")
            check(c["subject_id"], people | descriptions, where)
            check(c.get("place_id"), places, where)
            check(c.get("object_id"), objects | people, where)
            check(c.get("toward_id"), places, where)
            check(c.get("heard_from"), people, where)
    for v in s["villagers"]:
        own = {c["id"] for c in v["claims"]}
        for c in v["claims"]:
            for ref in (c.get("root_id"), c.get("parent_id")):
                check(ref, claim_ids, f"{v['id']}.{c['id']}")
        for rule in v.get("rules", []):
            for ref in rule["uses"] + rule.get("hides", []):
                check(ref, own, f"{v['id']}.{rule['id']}")
        for gate in v.get("gates", []):
            for ref in gate["guards"]:
                check(ref, own, f"{v['id']}.{gate['id']}")

    if errors:
        raise ValueError("scenario errors:\n  " + "\n  ".join(errors))
