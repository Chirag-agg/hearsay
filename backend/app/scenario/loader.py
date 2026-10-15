"""Build the tpl_* template graphs from a scenario dict (see hollowmere.json).

tpl_world    hidden truth: movements, debts, the killing, timeline events, seeded gossip hops
tpl_village  public: people, places, ROAD both ways, KNOWS both ways, homes and workplaces, facts
tpl_case     empty case board, seeded with public Person, Place and ROAD so travel checks run there
tpl_npc_<id> one villager's memory: Self, everyone they can name, places, objects, their claims,
             TRUSTS toward the people they know, and the liars' Rule / Lady Wren's Gate nodes

New games copy these with GRAPH.COPY (app.db.new_game), which keeps the indexes.
"""

from app import db
from app.db import create_edges as _edges
from app.db import create_nodes as _nodes

PUBLIC_FIELDS = ("id", "name", "role", "sex", "adult", "build")
ENGINE_FIELDS = ("accuracy", "honesty", "talkativeness", "mutation_bias")
CLAIM_FIELDS = ("id", "root_id", "parent_id", "pred", "subject_id", "place_id", "object_id", "toward_id",
                "t_from", "t_to", "confidence", "origin", "salience", "mutated", "private",
                "crowns", "note", "dormant")
RULE_FIELDS = ("id", "trigger", "action", "active", "subject_id", "t_from", "t_to", "topic", "asked_of",
               "hides", "uses", "supersedes", "stretch")


def _pick(d: dict, fields) -> dict:
    """Keep the listed fields that are set; FalkorDB has no null properties."""
    return {k: d[k] for k in fields if d.get(k) is not None}


class Scenario:
    """Derived lookups over the raw JSON."""

    def __init__(self, s: dict):
        self.s = s
        self.people = [s["victim"], *s["villagers"]]
        self.villagers = {v["id"]: v for v in s["villagers"]}
        self.claims = {c["id"]: c for v in s["villagers"] for c in v["claims"]}
        self.closeness = {}
        for k in s["knows"]:
            self.closeness[(k["a"], k["b"])] = self.closeness[(k["b"], k["a"])] = k["closeness"]

    def public_people(self) -> list[dict]:
        return [_pick(p, PUBLIC_FIELDS) for p in self.people]

    def places(self) -> list[dict]:
        return [_pick(p, ("id", "name")) for p in self.s["places"]]

    def roads(self) -> list[tuple[str, str, dict]]:
        out = []
        for r in self.s["roads"]:
            out.append((r["a"], r["b"], {"minutes": r["minutes"]}))
            out.append((r["b"], r["a"], {"minutes": r["minutes"]}))
        return out

    def trust(self, a: str, b: str) -> float:
        t = self.s["trust"]
        if b in t["toward"]:
            return t["toward"][b]
        return round(t["base"] + t["per_closeness"] * self.closeness.get((a, b), 0.0), 2)

    def confidence(self, owner: str, c: dict) -> float:
        if "confidence" in c:
            return c["confidence"]
        if c["origin"] != "heard":
            return 1.0
        parent = self.claims[c["parent_id"]]
        teller = c["heard_from"]
        parent_owner = next(v for v in self.villagers.values() if parent in v["claims"])
        return round(self.confidence(parent_owner["id"], parent) * self.trust(owner, teller) * 0.9, 3)


def build_village(g: str, sc: Scenario) -> None:
    s = sc.s
    _nodes(g, "Person", sc.public_people())
    _nodes(g, "Place", sc.places())
    _nodes(g, "Fact", [_pick(f, ("id", "text")) for f in s["facts"]])
    _edges(g, "ROAD", "Place", "Place", sc.roads())
    knows = []
    for k in s["knows"]:
        knows.append((k["a"], k["b"], {"closeness": k["closeness"]}))
        knows.append((k["b"], k["a"], {"closeness": k["closeness"]}))
    _edges(g, "KNOWS", "Person", "Person", knows)
    _edges(g, "LIVES_AT", "Person", "Place", [(p["id"], p["lives_at"], {}) for p in sc.people if p.get("lives_at")])
    _edges(g, "WORKS_AT", "Person", "Place", [(p["id"], p["works_at"], {}) for p in sc.people if p.get("works_at")])


def build_case(g: str, sc: Scenario) -> None:
    _nodes(g, "Person", sc.public_people())
    _nodes(g, "Place", sc.places())
    _edges(g, "ROAD", "Place", "Place", sc.roads())


def build_world(g: str, sc: Scenario, seed: int) -> None:
    s, truth = sc.s, sc.s["truth"]
    people = []
    for p in sc.people:
        row = _pick(p, PUBLIC_FIELDS + ENGINE_FIELDS)
        row["is_victim"] = p["id"] == truth["victim"]
        row["is_killer"] = p["id"] == truth["killer"]
        people.append(row)
    _nodes(g, "Person", people)
    _nodes(g, "Place", sc.places())
    _edges(g, "ROAD", "Place", "Place", sc.roads())
    _nodes(g, "Object", [_pick(o, ("id", "name")) for o in s["objects"]])
    _nodes(g, "Event", [{"id": f"e_{i:02d}", **e} for i, e in enumerate(truth["events"], 1)])
    # The gossip clock: the night's scripted hops are ticks -2..0, the engine continues from here.
    _nodes(g, "Clock", [{"tick": 0, "seed": seed}])
    _edges(g, "WAS_AT", "Person", "Place",
           [(w["person"], w["place"], {"from_t": w["from_t"], "to_t": w["to_t"]}) for w in truth["was_at"]])
    _edges(g, "OWES", "Person", "Person", [(o["from"], o["to"], {"crowns": o["crowns"]}) for o in truth["owes"]])
    _edges(g, "THREATENED", "Person", "Person", [(t["from"], t["to"], {"t": t["t"]}) for t in truth["threatened"]])
    _edges(g, "ARGUED_WITH", "Person", "Person", [(a["from"], a["to"], {"t": a["t"]}) for a in truth["argued_with"]])
    _edges(g, "TOOK", "Person", "Object", [(t["person"], t["object"], {"t": t["t"]}) for t in truth["took"]])
    _edges(g, "KILLED", "Person", "Person",
           [(k["from"], k["to"], _pick(k, ("t", "weapon", "place"))) for k in truth["killed"]])
    _edges(g, "HID", "Person", "Object",
           [(h["person"], h["object"], _pick(h, ("t", "place", "where"))) for h in truth["hid"]])
    _edges(g, "GOSSIPED", "Person", "Person",
           [(x["from"], x["to"], _pick(x, ("tick", "root_id", "claim_id", "mutated_field", "before", "after")))
            for x in truth["gossiped"]])


def build_npc(g: str, sc: Scenario, v: dict) -> None:
    s = sc.s
    me = v["id"]
    self_row = _pick(v, ("id", "name", "role", "persona", "player_trust", "player_warmth") + ENGINE_FIELDS)
    _nodes(g, "Self", [self_row])
    _nodes(g, "Person", [_pick(p, ("id", "name")) for p in sc.people])
    _nodes(g, "Place", sc.places())
    _nodes(g, "Object", [_pick(o, ("id", "name")) for o in s["objects"]])
    _nodes(g, "Description", [_pick(d, ("id", "text", "sex", "adult", "build", "carrying"))
                              for d in s["descriptions"]])

    claims = []
    for c in v["claims"]:
        row = {**c, "root_id": c.get("root_id", c["id"]), "confidence": sc.confidence(me, c),
               "private": c.get("private", False)}
        claims.append(_pick(row, CLAIM_FIELDS))
    _nodes(g, "Claim", claims)

    descriptions = {d["id"] for d in s["descriptions"]}
    objects = {o["id"] for o in s["objects"]}
    about_person = [(c["id"], c["subject_id"], {}) for c in v["claims"] if c["subject_id"] not in descriptions]
    about_desc = [(c["id"], c["subject_id"], {}) for c in v["claims"] if c["subject_id"] in descriptions]
    _edges(g, "ABOUT", "Claim", "Person", about_person)
    _edges(g, "ABOUT", "Claim", "Description", about_desc)
    _edges(g, "AT", "Claim", "Place", [(c["id"], c["place_id"], {}) for c in v["claims"] if c.get("place_id")])
    _edges(g, "INVOLVES", "Claim", "Object",
           [(c["id"], c["object_id"], {}) for c in v["claims"] if c.get("object_id") in objects])
    _edges(g, "WITNESSED", "Self", "Claim",
           [(me, c["id"], {"tick": 0}) for c in v["claims"] if c["origin"] == "witnessed"])
    _edges(g, "HEARD_FROM", "Claim", "Person",
           [(c["id"], c["heard_from"], {"tick": c.get("tick", 0)}) for c in v["claims"] if c["origin"] == "heard"])

    known = sorted({b for (a, b) in sc.closeness if a == me})
    _edges(g, "TRUSTS", "Self", "Person",
           [(me, b, {"score": sc.trust(me, b), "warmth": sc.closeness[(me, b)]}) for b in known])

    rules = v.get("rules", [])
    _nodes(g, "Rule", [_pick(r, RULE_FIELDS) for r in rules])
    _edges(g, "USES", "Rule", "Claim", [(r["id"], cid, {}) for r in rules for cid in r["uses"]])
    gates = v.get("gates", [])
    _nodes(g, "Gate", [_pick(x, ("id", "min_trust", "cite_pred", "cite_subject_id", "cite_toward_id", "refusal"))
                       for x in gates])
    _edges(g, "GUARDS", "Gate", "Claim", [(x["id"], cid, {}) for x in gates for cid in x["guards"]])


def build_templates(scenario: dict, seed: int) -> list[str]:
    """Delete every tpl_* graph and rebuild the 13 templates, before any gossip. Returns their names."""
    for name in db.list_graphs():
        if name.startswith("tpl_"):
            db.delete_graph(name)

    sc = Scenario(scenario)
    tpl = db.TEMPLATES
    builders = {
        tpl.world: lambda g: build_world(g, sc, seed),
        tpl.village: lambda g: build_village(g, sc),
        tpl.case: lambda g: build_case(g, sc),
    }
    for v in scenario["villagers"]:
        builders[tpl.npc(v["id"])] = lambda g, v=v: build_npc(g, sc, v)

    if set(builders) != set(tpl.all()):
        raise RuntimeError(f"scenario villagers don't match app.db.VILLAGERS: {sorted(set(builders) ^ set(tpl.all()))}")

    for name, build in builders.items():
        db.run_statements(name, "indexes")
        build(name)
    return list(builders)
