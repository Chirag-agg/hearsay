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

from app import db as dbmod  # noqa: E402
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
    "place": "chapel", "rule_id": "r1",
}

def pairs(rows: list[dict]) -> list[tuple]:
    """(statement, claim) pairs per row; each must be a real ASSERTS edge in the fixture."""
    return sorted((r["stmt_1"], r["claim_1"], r["stmt_2"], r["claim_2"]) for r in rows)


# name -> check on the result rows (list of dicts). Fixture-level sanity only.
EXPECT = {
    "q01b_recall_place": lambda rows: [(r["claim_id"], r["who"]) for r in rows]
    == [("c1", "Elena Marsh"), ("c2", "Elena Marsh"), ("c3", "Elena Marsh")],
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


def as_dicts(result) -> list[dict]:
    cols = [c[1] if isinstance(c, (list, tuple)) else c for c in result.header]
    cols = [c.decode() if isinstance(c, bytes) else c for c in cols]
    return [dict(zip(cols, row)) for row in result.result_set]


def run_syntax(client) -> int:
    graph = client.select_graph(SCRATCH)
    if SCRATCH in client.list_graphs():
        graph.delete()
    failures = 0

    for stmt in queries.load_statements("indexes"):
        graph.query(stmt)
    graph.query(FIXTURE)
    print(f"fixture loaded into {SCRATCH}")

    for name in queries.names():
        if name == "indexes":
            continue
        cypher = queries.load(name)
        try:
            rows = as_dicts(graph.query(cypher, params_for(cypher)))
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
        cypher = queries.load(name)
        params = {**params_for(cypher), **override}
        rows = as_dicts(graph.query(cypher, params))
        label = f"{name} {override or '(again)'}"
        if check(rows):
            print(f"ok    {label}")
        else:
            failures += 1
            print(f"WRONG {label}: {rows}")

    copy_name = f"{SCRATCH}_copy"
    try:
        graph.copy(copy_name)
        client.select_graph(copy_name).delete()
        print("ok    Graph.copy")
    except Exception as exc:
        failures += 1
        print(f"FAIL  Graph.copy: {exc}")

    graph.delete()
    return failures


def run_templates(client) -> int:
    """Check the seeded tpl_* graphs. W2 runs on a copy, so the templates are never changed."""
    def q(graph: str, name: str, **params) -> list[dict]:
        return as_dicts(client.select_graph(graph).ro_query(queries.load(name), params))

    def ids(rows: list[dict], key: str = "claim_id") -> list:
        return [r[key] for r in rows]

    hubs = q("tpl_village", "q04_gossip_hubs")
    circles = q("tpl_village", "q05_circles")
    travel = q("tpl_case", "q10_travel", from_place="chapel", to_place="mill", from_t=1260, to_t=1290)
    aldric = q("tpl_npc_aldric", "q01_recall", person="elena", t_from=1260, t_to=1320)
    elena_on_jonas = q("tpl_npc_elena", "q01_recall", person="jonas", t_from=1240, t_to=1250)
    elena_cover = q("tpl_npc_elena", "q01_recall", person="elena", t_from=1260, t_to=1320)
    bess_mill = q("tpl_npc_bess", "q01b_recall_place", place="mill", t_from=1290, t_to=1350)
    pip_river = q("tpl_npc_pip", "q01b_recall_place", place="riverside", t_from=1260, t_to=1320)
    bess_next = q("tpl_npc_bess", "q02_next_gossip", listener_roots=[])
    elena_next = q("tpl_npc_elena", "q02_next_gossip", listener_roots=[])
    hops = [(g, cid, q(g, "q03_who_told_me", claim_id=cid))
            for g, cid in [("tpl_npc_bess", "c_bess_heard_sighting"),
                           ("tpl_npc_brann", "c_brann_heard_sighting"),
                           ("tpl_npc_hale", "c_hale_heard_sighting")]]

    checks = [
        ("Q4 Bess hears the most gossip", hubs[0]["villager"] == "Bess Tolley", hubs),
        ("Q5 every person in one circle", sorted(n for r in circles for n in r["circle"]) == sorted(
            r[0] for r in client.select_graph("tpl_village").ro_query("MATCH (p:Person) RETURN p.name").result_set),
         circles),
        ("Q10 Chapel to Mill is 20 min, possible", travel and travel[0]["minutes_needed"] == 20 and travel[0]["possible"],
         travel),
        ("Q1 Aldric saw Elena leave the Chapel", "c_aldric_elena_left" in ids(aldric), aldric),
        ("Q1 Elena's dormant frame-up stays hidden", elena_on_jonas == [], elena_on_jonas),
        ("Q1 Elena 21:00-22:00 gives only her cover story", ids(elena_cover) == ["c_elena_lie_chapel"], elena_cover),
        ("Q1b Bess: a man near the Mill at 22:00, from Brann, confidence >= 0.2",
         [(r["claim_id"], r["who"], r["t_from"], r["heard_from"]) for r in bess_mill]
         == [("c_bess_heard_sighting", "a man with a lantern", 1315, "Brann Holt")]
         and bess_mill[0]["confidence"] >= 0.2, bess_mill),
        ("Q1b Pip: a woman with a lantern at 21:30",
         ("c_pip_saw_woman", "a woman with a lantern", 1285) in [(r["claim_id"], r["who"], r["t_from"]) for r in pip_river],
         pip_river),
        ("Q2 Bess retells the argument and the debt first",
         [r["c"].properties["id"] for r in bess_next] == ["c_bess_jonas_argued", "c_bess_jonas_owes"], bess_next),
        ("Q2 Elena only retells her cover story",
         [r["c"].properties["id"] for r in elena_next] == ["c_elena_lie_chapel"], elena_next),
        ("Q3 chain Bess <- Brann <- Hale <- Pip",
         [ids(rows, "source_id") for _, _, rows in hops] == [["brann"], ["hale"], ["pip"]], hops),
    ]

    copy_name = "smoke_tpl_elena"
    if copy_name in client.list_graphs():
        client.select_graph(copy_name).delete()
    client.select_graph("tpl_npc_elena").copy(copy_name)
    try:
        g = client.select_graph(copy_name)
        activated = as_dicts(g.query(queries.load("w02_activate_rule"), {"rule_id": "rule_elena_change_story"}))
        home = q(copy_name, "q01_recall", person="elena", t_from=1260, t_to=1320)
        rules = dict(g.ro_query("MATCH (r:Rule) RETURN r.id, r.active").result_set)
    finally:
        client.select_graph(copy_name).delete()
    checks += [
        ("W2 activates the rule and supersedes the cover story",
         activated == [{"rule_id": "rule_elena_change_story", "claims": 1, "superseded": "rule_elena_cover"}]
         and rules["rule_elena_change_story"] and not rules["rule_elena_cover"], (activated, rules)),
        ("W2 changed story: Q1 Elena 21:00-22:00 gives only the new lie", ids(home) == ["c_elena_lie_home"], home),
    ]

    failures = 0
    for label, ok, got in checks:
        if ok:
            print(f"ok    tpl: {label}")
        else:
            failures += 1
            print(f"WRONG tpl: {label}: {got}")
    return failures


def run_case(client) -> int:
    # TODO(graph owner): once seed.py builds tpl_* from hollowmere.json, replay the
    # off-camera questions from the demo script into a fresh game and assert:
    #   Q4 top villager is Bess; Q7 chain is Bess -> Hale -> Pip with 21:30 and "woman";
    #   Q6b flags Elena vs Aldric; Q10 Chapel -> Mill is 20 min, possible;
    #   Q12 returns Elena and Lady Wren; Q13 confirms Imogen and Bess;
    #   Q14 with "a man" ranks Jonas 12, Elena 9; with Pip's sighting Elena 12, Jonas 9.
    raise NotImplementedError("case mode needs scripts/seed.py and the demo case data")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--case", action="store_true", help="check answers on the seeded demo case")
    args = parser.parse_args()

    client = dbmod.connect()
    if args.case:
        failures = run_case(client)
    else:
        failures = run_syntax(client)
        if set(dbmod.template_graphs()) <= set(client.list_graphs()):
            failures += run_templates(client)
        else:
            print("skip  template checks: run scripts/seed.py first")
    print("all queries passed" if failures == 0 else f"{failures} failing")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
