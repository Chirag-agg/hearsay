"""Day-1 check that every query in backend/app/queries runs on FalkorDB.

    python scripts/smoke_cypher.py            # syntax mode, then template mode if tpl_* exist
    python scripts/smoke_cypher.py --case     # demo-case mode, after scripts/seed.py

Syntax mode builds a tiny fixture in a scratch graph and runs every query on it,
so parse errors, missing algo.* procedures and FalkorDB-specific behaviour
(zero-length paths, map literals in list comprehensions, collect() skipping
nulls, Graph.copy) show up before any game code depends on them. A few
fixture expectations check that the queries also return the right thing.

Template mode runs the villager and village queries (Q1, Q1b, Q2, Q3, Q4, Q5, Q10,
W2) on the tpl_* graphs that scripts/seed.py builds from hollowmere.json, and checks
the answers the demo depends on: Bess tops PageRank, the night's rumor reaches Bess
as "a man near the Mill at 22:00" with confidence of at least 0.2, and each hop
names its teller.

Case mode runs the queries on the seeded demo case and asserts the answers from
the architecture doc (Elena 12, Jonas 9, and so on). It is a TODO until seed.py
and the case data exist.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db  # noqa: E402
from app import queries  # noqa: E402

SCRATCH = "smoke_scratch"

# The smallest case that exercises the queries:
#   c1 Elena: at the Chapel 19:00-22:00 (her lie)      c2 Aldric: saw her leave the Chapel at 21:00
#   c3 Bess:  saw her at the Chapel 19:00-21:00        c4 Elena, later session: home 21:10-22:00
#   c5 Aldric: saw her at the Tavern at 20:00 (clashes with c1 and c3)
# Statements and claims are deliberately many-to-many-looking (several statements,
# several claims per person) because FalkorDB has mis-paired them in multi-pattern
# MATCHes; see the WITH barriers in q06a/q06b.
FIXTURE = """
CREATE (chapel:Place {id: 'chapel', name: 'Chapel'}),
       (mill:Place {id: 'mill', name: 'Old Mill'}),
       (tavern:Place {id: 'tavern', name: 'Tavern'}),
       (chapel)-[:ROAD {minutes: 20}]->(mill), (mill)-[:ROAD {minutes: 20}]->(chapel),
       (tavern)-[:ROAD {minutes: 25}]->(mill), (mill)-[:ROAD {minutes: 25}]->(tavern),
       (elena:Person {id: 'elena', name: 'Elena Marsh', sex: 'f', adult: true}),
       (aldric:Person {id: 'aldric', name: 'Father Aldric', sex: 'm', adult: true}),
       (bess:Person {id: 'bess', name: 'Bess Tolley', sex: 'f', adult: true}),
       (elena)-[:KNOWS {closeness: 0.5}]->(bess), (bess)-[:KNOWS {closeness: 0.5}]->(elena),
       (aldric)-[:KNOWS {closeness: 0.5}]->(bess), (bess)-[:KNOWS {closeness: 0.5}]->(aldric),
       (s1:Statement {id: 's1', text: 'I was at the Chapel until ten.', session: 1, tick: 1}),
       (s2:Statement {id: 's2', text: 'She left at nine.', session: 1, tick: 2}),
       (s1)-[:SAID_BY]->(elena), (s2)-[:SAID_BY]->(aldric),
       (c1:Claim {id: 'c1', root_id: 'r1', pred: 'WAS_AT', subject_id: 'elena', place_id: 'chapel',
                  t_from: 1140, t_to: 1320, teller_id: 'elena', reported_as: 'saw',
                  confidence: 1.0, salience: 0.5, origin: 'lie'}),
       (c2:Claim {id: 'c2', root_id: 'r2', pred: 'LEFT', subject_id: 'elena', place_id: 'chapel',
                  t_from: 1255, t_to: 1265, teller_id: 'aldric', reported_as: 'saw',
                  confidence: 1.0, salience: 0.5, origin: 'witnessed'}),
       (s3:Statement {id: 's3', text: 'Elena was at prayer from seven.', session: 1, tick: 3}),
       (s3)-[:SAID_BY]->(bess),
       (c3:Claim {id: 'c3', root_id: 'r3', pred: 'WAS_AT', subject_id: 'elena', place_id: 'chapel',
                  t_from: 1140, t_to: 1260, teller_id: 'bess', reported_as: 'saw',
                  confidence: 1.0, salience: 0.5, origin: 'witnessed'}),
       (herbalist:Place {id: 'herbalist', name: 'Herbalist shop'}),
       (s4:Statement {id: 's4', text: 'I left at nine and went home.', session: 2, tick: 4}),
       (s4)-[:SAID_BY]->(elena),
       (c4:Claim {id: 'c4', root_id: 'r4', pred: 'WAS_AT', subject_id: 'elena', place_id: 'herbalist',
                  t_from: 1270, t_to: 1320, teller_id: 'elena', reported_as: 'saw',
                  confidence: 1.0, salience: 0.5, origin: 'lie'}),
       (s5:Statement {id: 's5', text: 'I saw Elena at the Tavern at eight.', session: 1, tick: 5}),
       (s5)-[:SAID_BY]->(aldric),
       (c5:Claim {id: 'c5', root_id: 'r5', pred: 'WAS_AT', subject_id: 'elena', place_id: 'tavern',
                  t_from: 1195, t_to: 1205, teller_id: 'aldric', reported_as: 'saw',
                  confidence: 1.0, salience: 0.5, origin: 'witnessed'}),
       (s1)-[:ASSERTS]->(c1), (s2)-[:ASSERTS]->(c2), (s3)-[:ASSERTS]->(c3),
       (s4)-[:ASSERTS]->(c4), (s5)-[:ASSERTS]->(c5),
       (c1)-[:ABOUT]->(elena), (c2)-[:ABOUT]->(elena), (c3)-[:ABOUT]->(elena),
       (c4)-[:ABOUT]->(elena), (c5)-[:ABOUT]->(elena),
       (c1)-[:AT]->(chapel), (c2)-[:AT]->(chapel), (c3)-[:AT]->(chapel),
       (c4)-[:AT]->(herbalist), (c5)-[:AT]->(tavern),
       (:Description {id: 'd1', text: 'a woman with a lantern', sex: 'f', adult: true})-[:FITS]->(elena),
       (:Self {id: 'aldric', name: 'Father Aldric'})-[:HAD]->(:Conversation {player_id: 'p1', session: 1, tick: 1})
           -[:INCLUDED]->(:Question {text: 'Was Elena at prayer?', tick: 1})-[:ANSWERED_WITH]->(c2),
       (:Rule {id: 'r1', trigger: 'asked_whereabouts', action: 'replace', active: false})-[:USES]->(c4)
"""

# Every $param any query uses. Each query gets only the keys it mentions.
PARAMS = {
    "person": "elena", "t_from": 1260, "t_to": 1320, "t": 1200,
    "claim_id": "c2", "listener_roots": [], "player": "p1",
    "from_place": "chapel", "to_place": "mill", "from_t": 1260, "to_t": 1290,
    "description_id": "d1", "scene": "mill",
    "victim": "silas", "weapon_place": "smithy", "death_t": 1290, "sighting": "d1",
    "key": "stayed_but_left:c1:c2", "kind": "stayed_but_left", "claim_1": "c1", "claim_2": "c2",
    "detail": "smoke", "tick": 2, "stmt_1": "s1", "stmt_2": "s2",
    "place": "chapel", "rule_id": "r1", "claim_ids": ["c2", "c1"], "root_id": "r2",
}

def pairs(rows: list[dict]) -> list[tuple]:
    """(statement, claim) pairs per row; each must be a real ASSERTS edge in the fixture."""
    return sorted((r["stmt_1"], r["claim_1"], r["stmt_2"], r["claim_2"]) for r in rows)


# name -> check on the result rows (list of dicts). Fixture-level sanity only.
EXPECT = {
    "q01b_recall_place": lambda rows: [(r["claim_id"], r["who"]) for r in rows]
    == [("c1", "Elena Marsh"), ("c2", "Elena Marsh"), ("c3", "Elena Marsh")],
    "q01c_claim_details": lambda rows: sorted((r["claim_id"], r["who"], r["place"]) for r in rows)
    == [("c1", "Elena Marsh", "Chapel"), ("c2", "Elena Marsh", "Chapel")],
    "q01d_recall_rumor": lambda rows: [r["claim_id"] for r in rows] == ["c2"],
    "q06a_two_places": lambda rows: pairs(rows) == [("s1", "c1", "s5", "c5"), ("s3", "c3", "s5", "c5")],
    "q06b_stayed_but_left": lambda rows: pairs(rows) == [("s1", "c1", "s2", "c2")],
    "q07_trace_rumor": lambda rows: len(rows) == 1 and rows[0]["chain"][0]["claim"] == "c2",
    "q08a_backing": lambda rows: rows == [{"backing": 0}],
    "q08b_leads": lambda rows: sorted((r["only_source"], r["place"]) for r in rows)
    == [("Father Aldric", "chapel"), ("Father Aldric", "tavern")],
    "q10_travel": lambda rows: len(rows) == 1 and rows[0]["minutes_needed"] == 20 and rows[0]["possible"],
    # Elena's own story moved from the Chapel to home, so this is the only same-teller change.
    "q11_changed_story": lambda rows: pairs(rows) == [("s1", "c1", "s4", "c4")],
    "q12_suspects_fitting": lambda rows: [r["suspect"] for r in rows] == ["Elena Marsh"],
    # One eyewitness per place and nothing heard, so collect() must drop the nulls.
    "q13_alibi": lambda rows: sorted(rows, key=lambda r: r["place"]) == [
        {"place": "chapel", "eyewitnesses": ["bess"], "unverified": [], "confirmed": False},
        {"place": "tavern", "eyewitnesses": ["aldric"], "unverified": [], "confirmed": False},
    ],
    # Elena fits d1 (3 points). Guards the FalkorDB quirk that zeroed the fit term after aggregations.
    "q14_rank_suspects": lambda rows: any(r["suspect_id"] == "elena" and r["fits"] == 1 for r in rows),
    "w01_merge_contradiction": lambda rows: rows == [{"new": True}],
    "w02_activate_rule": lambda rows: rows == [{"rule_id": "r1", "claims": 1, "superseded": None}],
}

# Extra runs with different params: (query, params override, check).
EXTRA = [
    # Bess's Chapel sighting is backed by Elena's own claim, and Elena's by Bess; c4 (same teller) never counts.
    ("q08a_backing", {"claim_id": "c3"}, lambda rows: rows == [{"backing": 1}]),
    ("q08a_backing", {"claim_id": "c1"}, lambda rows: rows == [{"backing": 1}]),
    # Running the same MERGE again must not create a second contradiction.
    ("w01_merge_contradiction", {}, lambda rows: rows == [{"new": False}]),
]


def params_for(cypher: str) -> dict:
    used = set(re.findall(r"\$(\w+)", cypher))
    missing = used - PARAMS.keys()
    if missing:
        raise KeyError(f"no smoke value for params: {sorted(missing)}")
    return {k: PARAMS[k] for k in used}


def run_syntax() -> int:
    if SCRATCH in db.list_graphs():
        db.delete_graph(SCRATCH)
    failures = 0

    db.run_statements(SCRATCH, "indexes")
    db.run_cypher(SCRATCH, FIXTURE, label="smoke fixture")
    print(f"fixture loaded into {SCRATCH}")

    for name in queries.names():
        if name == "indexes":
            continue
        try:
            # read-only for q* files, as the agents run them; w* files write
            rows = db.run(SCRATCH, name, params_for(queries.load(name)))
        except Exception as exc:  # report every failure, not just the first
            failures += 1
            print(f"FAIL  {name}: {exc}")
            continue
        check = EXPECT.get(name)
        if check and not check(rows):
            failures += 1
            print(f"WRONG {name}: {rows}")
        else:
            print(f"ok    {name} ({len(rows)} rows)")

    for name, override, check in EXTRA:
        rows = db.run(SCRATCH, name, {**params_for(queries.load(name)), **override})
        label = f"{name} {override or '(again)'}"
        if check(rows):
            print(f"ok    {label}")
        else:
            failures += 1
            print(f"WRONG {label}: {rows}")

    copy_name = f"{SCRATCH}_copy"
    try:
        db.copy_graph(SCRATCH, copy_name)
        db.delete_graph(copy_name)
        print("ok    Graph.copy")
    except Exception as exc:
        failures += 1
        print(f"FAIL  Graph.copy: {exc}")

    db.delete_graph(SCRATCH)
    return failures


def run_templates() -> int:
    """Check the seeded tpl_* graphs, after the pre-game gossip ticks seed.py runs.

    Gossip has moved claims around by then, so checks name the claims that matter rather
    than whole result lists. W2 runs on a copy, so the templates are never changed."""
    tpl = db.TEMPLATES

    def q(graph: str, name: str, **params) -> list[dict]:
        return db.run(graph, name, params)

    def ro(graph: str, cypher: str, **params) -> list[dict]:
        return db.run_cypher(graph, cypher, params, label="smoke check", readonly=True)

    def ids(rows: list[dict], key: str = "claim_id") -> list:
        return [r[key] for r in rows]

    def inside(rows: list[dict], t_from: int, t_to: int) -> list:
        """Claim ids that overlap the window, not just touch its edge."""
        return [r["claim_id"] for r in rows if r["t_from"] < t_to and t_from < r["t_to"]]

    hubs = q(tpl.village, "q04_gossip_hubs")
    circles = q(tpl.village, "q05_circles")
    people = ids(ro(tpl.village, "MATCH (p:Person) RETURN p.name AS name"), "name")
    travel = q(tpl.case, "q10_travel", from_place="chapel", to_place="mill", from_t=1260, to_t=1290)
    aldric = q(tpl.npc("aldric"), "q01_recall", person="elena", t_from=1260, t_to=1320)
    elena_on_jonas = q(tpl.npc("elena"), "q01_recall", person="jonas", t_from=1240, t_to=1250)
    elena_cover = q(tpl.npc("elena"), "q01_recall", person="elena", t_from=1260, t_to=1320)
    bess_mill = q(tpl.npc("bess"), "q01b_recall_place", place="mill", t_from=1290, t_to=1350)
    bess_sightings = ro(tpl.npc("bess"), "MATCH (c:Claim {root_id: 'c_pip_saw_woman'}) RETURN c.id AS id")
    pip_river = q(tpl.npc("pip"), "q01b_recall_place", place="riverside", t_from=1260, t_to=1320)
    bess_next = [r["c"].properties for r in q(tpl.npc("bess"), "q02_next_gossip", listener_roots=[])]
    elena_next = [r["c"].properties for r in q(tpl.npc("elena"), "q02_next_gossip", listener_roots=[])]
    hops = [q(tpl.npc(v), "q03_who_told_me", claim_id=cid)
            for v, cid in [("bess", "c_bess_heard_sighting"), ("brann", "c_brann_heard_sighting"),
                           ("hale", "c_hale_heard_sighting")]]
    elena_secrets = ids(ro(tpl.npc("elena"), "MATCH (c:Claim {private: true}) RETURN c.id AS id"), "id")
    leaked = [(v, r["id"]) for v in db.VILLAGERS if v != "elena"
              for r in ro(tpl.npc(v), "MATCH (c:Claim) WHERE c.root_id IN $roots RETURN c.id AS id", roots=elena_secrets)]
    heard = sum(ro(tpl.npc(v), "MATCH (c:Claim {origin: 'heard'}) RETURN count(c) AS n")[0]["n"] for v in db.VILLAGERS)
    logged = ro(tpl.world, "MATCH ()-[g:GOSSIPED]->() RETURN count(g) AS n")[0]["n"]
    clock = ro(tpl.world, "MATCH (k:Clock) RETURN k.tick AS tick")

    checks = [
        ("Q4 Bess hears the most gossip", hubs[0]["villager"] == "Bess Tolley", hubs),
        ("Q5 every person in one circle", sorted(n for r in circles for n in r["circle"]) == sorted(people), circles),
        ("Q10 Chapel to Mill is 20 min, possible", travel and travel[0]["minutes_needed"] == 20 and travel[0]["possible"],
         travel),
        ("Q1 Aldric saw Elena leave the Chapel", "c_aldric_elena_left" in ids(aldric), aldric),
        ("Q1 Elena's dormant frame-up stays hidden", "c_elena_lie_jonas_mill" not in ids(elena_on_jonas), elena_on_jonas),
        ("Q1 Elena 21:00-22:00 gives only her cover story",
         inside(elena_cover, 1260, 1320) == ["c_elena_lie_chapel"], elena_cover),
        ("Q1b Bess: a man near the Mill at 22:00, from Brann, confidence >= 0.2",
         any(r["claim_id"] == "c_bess_heard_sighting" and r["who"] == "a man with a lantern" and r["t_from"] == 1315
             and r["heard_from"] == "Brann Holt" and r["confidence"] >= 0.2 for r in bess_mill), bess_mill),
        ("Bess holds one version of the sighting (no drift)", ids(bess_sightings, "id") == ["c_bess_heard_sighting"],
         bess_sightings),
        ("Q1b Pip: a woman with a lantern at 21:30",
         ("c_pip_saw_woman", "a woman with a lantern", 1285) in [(r["claim_id"], r["who"], r["t_from"]) for r in pip_river],
         pip_river),
        ("Q2 Bess retells two public claims, best first",
         len(bess_next) == 2 and not any(c.get("private") for c in bess_next)
         and bess_next[0]["salience"] * bess_next[0]["confidence"] >= bess_next[1]["salience"] * bess_next[1]["confidence"],
         bess_next),
        ("Q2 Elena never retells a secret or a dormant lie",
         not any(c.get("private") or c.get("dormant") for c in elena_next), elena_next),
        ("Q3 chain Bess <- Brann <- Hale <- Pip", [ids(rows, "source_id") for rows in hops] == [["brann"], ["hale"], ["pip"]],
         hops),
        ("Gossip never spreads Elena's secrets", leaked == [], leaked),
        ("Every gossip hop is logged in the truth graph", heard == logged, (heard, logged)),
        ("Clock is at the end of the pre-game ticks", clock == [{"tick": 12}], clock),
    ]

    copy_name = "smoke_tpl_elena"
    if copy_name in db.list_graphs():
        db.delete_graph(copy_name)
    db.copy_graph(tpl.npc("elena"), copy_name)
    try:
        activated = db.run(copy_name, "w02_activate_rule", {"rule_id": "rule_elena_change_story"})
        home = q(copy_name, "q01_recall", person="elena", t_from=1260, t_to=1320)
        rules = {r["id"]: r["active"] for r in ro(copy_name, "MATCH (r:Rule) RETURN r.id AS id, r.active AS active")}
    finally:
        db.delete_graph(copy_name)
    checks += [
        ("W2 activates the rule and supersedes the cover story",
         activated == [{"rule_id": "rule_elena_change_story", "claims": 1, "superseded": "rule_elena_cover"}]
         and rules["rule_elena_change_story"] and not rules["rule_elena_cover"], (activated, rules)),
        ("W2 changed story: Q1 Elena 21:00-22:00 gives only the new lie",
         inside(home, 1260, 1320) == ["c_elena_lie_home"], home),
    ]

    failures = 0
    for label, ok, got in checks:
        if ok:
            print(f"ok    tpl: {label}")
        else:
            failures += 1
            print(f"WRONG tpl: {label}: {got}")
    return failures


def run_case() -> int:
    # TODO(graph owner): replay the off-camera questions from the demo script into a fresh
    # game and assert: Q7 chain is Bess -> Brann -> Hale -> Pip with 21:30 and "woman";
    #   Q6b flags Elena vs Aldric; Q12 returns Elena and Lady Wren; Q13 confirms Imogen and Bess;
    #   Q14 with "a man" ranks Jonas 12, Elena 9; with Pip's sighting Elena 12, Jonas 9.
    raise NotImplementedError("case mode needs the case writer (statements and contradictions)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--case", action="store_true", help="check answers on the seeded demo case")
    args = parser.parse_args()

    if args.case:
        failures = run_case()
    else:
        failures = run_syntax()
        if set(db.TEMPLATES.all()) <= set(db.list_graphs()):
            failures += run_templates()
        else:
            print("skip  template checks: run scripts/seed.py first")
    print("all queries passed" if failures == 0 else f"{failures} failing")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
