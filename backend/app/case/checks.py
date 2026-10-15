"""Contradiction checks, who they implicate, alibis, leads and the suspect ranking.

After every answer: Q6a, Q6b and Q11 return every clash so far; each is merged once on
key = kind + both claim ids sorted (W1), so re-running changes nothing. Then every
IMPLICATES edge is deleted and recomputed, because backing changes as more villagers talk:
  Q11 changed_story   -> the villager who changed it, root of the earlier (abandoned) claim
  Q6b stayed_but_left -> the person, if the stay claim is about themselves; else the Q6a rule
  Q6a two_places      -> the side with less backing (Q8a); on a tie, the one side talking about
                         their own whereabouts; otherwise nobody (an open lead)
alibi_confirmed is recomputed with Q13, only for the time of death.
"""

from app import db
from app.case.writer import CASE_FILE

CHECKS = [("q06a_two_places", "two_places"), ("q06b_stayed_but_left", "stayed_but_left"),
          ("q11_changed_story", "changed_story")]


def _detail(kind: str, r: dict, names: dict[str, str]) -> str:
    def n(key):
        return names.get(r[key], r[key])

    def who(teller):  # "Elena Marsh says she stayed", not "Elena Marsh says Elena Marsh stayed"
        return "they themselves" if teller == n("person") else n("person")

    if kind == "two_places":
        return (f"{r['says_1']} puts {who(r['says_1'])} at the {n('place_1')}; "
                f"{r['says_2']} puts {who(r['says_2'])} at the {n('place_2')} at the same time")
    if kind == "stayed_but_left":
        return (f"{r['claims_stayed']} says {'they' if r['claims_stayed'] == n('person') else n('person')} stayed "
                f"at the {n('place')}; {r['says_left']} saw them leave")
    return f"{r['villager']} first said the {n('first_said')}, later the {n('later_said')}"


def find_contradictions(graph: str, tick: int) -> list[dict]:
    """Merge every clash found so far; returns them all, with new=True for the ones found now."""
    names = {r["id"]: r["name"] for r in db.run_cypher(
        graph, "MATCH (n) WHERE n:Person OR n:Place RETURN n.id AS id, n.name AS name",
        label="case names", readonly=True)}
    found = []
    for query, kind in CHECKS:
        for r in db.run(graph, query):
            key = f"{kind}:" + ":".join(sorted([r["claim_1"], r["claim_2"]]))
            merged = db.run(graph, "w01_merge_contradiction", {
                "key": key, "kind": kind, "claim_1": r["claim_1"], "claim_2": r["claim_2"],
                "detail": _detail(kind, r, names), "tick": tick, "stmt_1": r["stmt_1"], "stmt_2": r["stmt_2"]})
            found.append({"key": key, "kind": kind, "detail": _detail(kind, r, names), "claim_1": r["claim_1"],
                          "claim_2": r["claim_2"], "stmt_1": r["stmt_1"], "stmt_2": r["stmt_2"],
                          "new": bool(merged and merged[0]["new"])})
    return found


def backing(graph: str, claim_id: str) -> int:
    return db.run(graph, "q08a_backing", {"claim_id": claim_id})[0]["backing"]


def implicated(graph: str, kind: str, c1: dict, c2: dict) -> tuple[str, str] | None:
    """(person id, root_id of their claim) for one contradiction, or None for an open lead."""
    def own(c):
        return c["teller_id"] == c["subject_id"]

    if kind == "changed_story":
        return c1["teller_id"], c1["root_id"]
    if kind == "stayed_but_left" and own(c1):
        return c1["teller_id"], c1["root_id"]
    b1, b2 = backing(graph, c1["id"]), backing(graph, c2["id"])
    if b1 != b2:
        weak = c1 if b1 < b2 else c2
        return weak["teller_id"], weak["root_id"]
    if own(c1) != own(c2):
        liar = c1 if own(c1) else c2
        return liar["teller_id"], liar["root_id"]
    return None


def recompute_implicates(graph: str) -> list[dict]:
    rows = db.run_cypher(graph, """
        MATCH (x:Contradiction)
        MATCH (c1:Claim) WHERE c1.id = x.claim_1
        WITH x, c1
        MATCH (c2:Claim) WHERE c2.id = x.claim_2
        RETURN x.key AS key, x.kind AS kind, properties(c1) AS c1, properties(c2) AS c2
        """, label="case contradictions", readonly=True)
    edges = []
    for r in rows:
        who = implicated(graph, r["kind"], r["c1"], r["c2"])
        if who:
            edges.append({"key": r["key"], "person": who[0], "root_id": who[1]})
    with db.graph_lock(graph):
        db.run_cypher(graph, "MATCH (:Contradiction)-[i:IMPLICATES]->() DELETE i", label="case clear IMPLICATES")
        if edges:
            db.run_cypher(graph, """
                UNWIND $rows AS r
                MATCH (x:Contradiction {key: r.key}), (p:Person {id: r.person})
                CREATE (x)-[:IMPLICATES {root_id: r.root_id}]->(p)
                """, {"rows": edges}, label="case IMPLICATES")
    return edges


def alibi(graph: str, person: str, t: int) -> list[dict]:
    """Q13 for any time; nothing is stored."""
    return db.run(graph, "q13_alibi", {"person": person, "t": t, "scene": CASE_FILE["scene"]})


def recompute_alibis(graph: str) -> dict[str, bool]:
    """alibi_confirmed for everyone, at the time of death only (Q12 and Q14 read it as the murder alibi)."""
    t = CASE_FILE["death_t"]
    candidates = [r["id"] for r in db.run_cypher(graph, """
        MATCH (c:Claim {pred: 'WAS_AT'}) WHERE c.t_from <= $t AND c.t_to >= $t
        RETURN DISTINCT c.subject_id AS id""", {"t": t}, label="case alibi candidates", readonly=True)]
    confirmed = {p: any(r["confirmed"] for r in alibi(graph, p, t)) for p in sorted(candidates)}
    db.run_cypher(graph, "MATCH (p:Person) SET p.alibi_confirmed = p.id IN $yes",
                  {"yes": sorted(p for p, ok in confirmed.items() if ok)}, label="case alibi_confirmed")
    return confirmed


def run_checks(graphs: db.Graphs, tick: int) -> dict:
    graph = graphs.case
    contradictions = find_contradictions(graph, tick)
    implicates = recompute_implicates(graph)
    alibis = recompute_alibis(graph)
    leads = db.run(graph, "q08b_leads")
    return {"contradictions": contradictions, "new": [c for c in contradictions if c["new"]],
            "implicates": implicates, "alibis": alibis, "leads": leads}


def current_sighting(graph: str) -> str | None:
    """The scene sighting the player holds: the latest description claim, traced as far as it goes."""
    latest = db.run_cypher(graph, """
        MATCH (s:Statement)-[:ASSERTS]->(c:Claim)-[:ABOUT]->(:Description)
        RETURN c.id AS id ORDER BY s.tick DESC, c.id LIMIT 1""", label="case sighting", readonly=True)
    if not latest:
        return None
    chain = db.run(graph, "q07_trace_rumor", {"claim_id": latest[0]["id"]})[0]["chain"]
    return chain[-1]["about"]


def rank_suspects(graph: str, sighting: str | None = None) -> list[dict]:
    sighting = sighting or current_sighting(graph) or ""
    rows = db.run(graph, "q14_rank_suspects", {"victim": CASE_FILE["victim"], "weapon_place": CASE_FILE["weapon_place"],
                                               "death_t": CASE_FILE["death_t"], "sighting": sighting})
    return rows


def suspects_fitting(graph: str, description_id: str) -> list[dict]:
    """Q13 for everyone who fits first (via recompute_alibis), then Q12."""
    recompute_alibis(graph)
    return db.run(graph, "q12_suspects_fitting", {"description_id": description_id})
