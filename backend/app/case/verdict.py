"""Accusation, scored against the hidden truth graph, and the reveal it unlocks.

The truth graph (game_<g>_world) is read here and only here (plus the God view): the
detective and the villager agents never touch it.
"""

import json
import re

from app import db, games
from app.case.writer import CASE_FILE, seeded
from app.engine.gossip import hhmm

MOTIVE_WORDS = re.compile(r"\b(debt|owe\w*|crowns?|300|shop|money|loan|lend\w*|pay\w*|friday)\b", re.I)
MOTIVE_PREDS = ("OWES", "THREATENED", "ARGUED_WITH")
REACTION_TEXT = {
    "rule_elena_frame_jonas": "heard you asked about the hammer, and started saying she saw Jonas carry it toward the Mill at 20:45",
    "rule_elena_change_story": "heard you asked Father Aldric when she left the Chapel, and changed her story to going home at 21:00",
}


def _ro(graph: str, cypher: str, params: dict | None = None, label: str = "verdict") -> list[dict]:
    return db.run_cypher(graph, cypher, params, label=label, readonly=True)


def _evidence(case: str, suspect: str, statement_ids: list[str]) -> dict[str, list[str]]:
    """Which kinds of evidence the cited statements give against the suspect."""
    claims = _ro(case, """
        MATCH (s:Statement)-[:ASSERTS]->(c:Claim) WHERE s.id IN $ids
        RETURN s.id AS statement, properties(c) AS c""", {"ids": statement_ids}, "verdict cited claims")
    lies = {r["s"] for r in _ro(case, """
        MATCH (p:Person {id: $suspect})<-[:IMPLICATES]-(:Contradiction)-[:INVOLVES]->(s:Statement)
        RETURN s.id AS s""", {"suspect": suspect}, "verdict lies")}
    fits = {r["d"] for r in _ro(case, "MATCH (d:Description)-[:FITS]->(:Person {id: $suspect}) RETURN d.id AS d",
                                {"suspect": suspect}, "verdict fits")}
    victim, death_t = CASE_FILE["victim"], CASE_FILE["death_t"]
    found: dict[str, set[str]] = {"motive": set(), "means": set(), "opportunity": set(), "lie": set()}
    for r in claims:
        c = r["c"]
        about_suspect = c["subject_id"] == suspect
        if c["pred"] in MOTIVE_PREDS and {c["subject_id"], c.get("object_id")} == {suspect, victim}:
            found["motive"].add(r["statement"])
        if about_suspect and c.get("place_id") == CASE_FILE["weapon_place"] and c["t_to"] <= death_t:
            found["means"].add(r["statement"])
        if (about_suspect and c["pred"] == "LEFT" and c["t_from"] <= death_t) or c["subject_id"] in fits:
            found["opportunity"].add(r["statement"])
        if r["statement"] in lies:
            found["lie"].add(r["statement"])
    return {k: sorted(v) for k, v in found.items()}


def accuse(g: str, suspect_id: str, motive: str, statement_ids: list[str]) -> dict:
    game = games.touch(g)
    graphs = db.game(g)
    status = games.status(g)
    truth = _ro(graphs.world, """
        MATCH (k:Person)-[x:KILLED]->(v:Person)
        OPTIONAL MATCH (k)-[o:OWES]->(v)
        RETURN k.id AS killer, k.name AS name, x.t AS t, x.weapon AS weapon, x.place AS place, o.crowns AS crowns""",
        label="verdict truth")[0]
    evidence = _evidence(graphs.case, suspect_id, list(statement_ids))
    right_person = suspect_id == truth["killer"]
    right_motive = right_person and bool(MOTIVE_WORDS.search(motive or ""))
    kinds = [k for k, v in evidence.items() if v]
    score = 50 * right_person + 20 * right_motive + 10 * min(len(kinds), 3)
    aid = seeded("a_", g, status["tick"], suspect_id)
    with db.graph_lock(graphs.case):
        db.create_nodes(graphs.case, "Accusation", [{"id": aid, "suspect_id": suspect_id, "motive": motive,
                                                     "tick": status["tick"], "score": score}])
        db.run_cypher(graphs.case, """
            MATCH (a:Accusation {id: $aid}), (s:Statement) WHERE s.id IN $ids
            WITH a, s
            CREATE (a)-[:CITES]->(s)""", {"aid": aid, "ids": list(statement_ids)}, label="verdict cites")
    verdict = {"accusation_id": aid, "suspect_id": suspect_id, "correct": right_person, "motive_correct": right_motive,
               "evidence": evidence, "score": score,
               "summary": ("You found the killer." if right_person else "The village hangs the wrong person.")
               + (" The motive holds." if right_motive else (" But the motive is wrong." if right_person else ""))}
    db.run_cypher(games.META, "MATCH (x:Game {id: $id}) SET x.verdict = $v",
                  {"id": g, "v": json.dumps(verdict)}, label="games meta")
    return verdict


def reveal(g: str) -> dict:
    """Truth next to belief: what happened, how the sighting mutated hop by hop, and every lie caught."""
    game = games.touch(g)
    if not game.get("verdict"):
        raise PermissionError("the reveal opens after an accusation")
    graphs = db.game(g)
    names = {r["id"]: r["name"] for r in _ro(graphs.world, "MATCH (p) WHERE p:Person OR p:Place "
                                                          "RETURN p.id AS id, p.name AS name")}
    events = _ro(graphs.world, "MATCH (e:Event) RETURN e.t AS t, e.text AS text ORDER BY t")
    killed = _ro(graphs.world, """MATCH (k:Person)-[x:KILLED]->(v:Person)
        RETURN k.name AS killer, v.name AS victim, x.t AS t, x.weapon AS weapon, x.place AS place""")[0]
    hops = _ro(graphs.world, """
        MATCH (a:Person)-[h:GOSSIPED]->(b:Person) WHERE h.root_id = $root
        RETURN a.id AS teller, b.id AS listener, h.tick AS tick, h.mutated_field AS changed,
               h.before AS before, h.after AS after ORDER BY tick, teller, listener""",
        {"root": "c_pip_saw_woman"})
    totals = _ro(graphs.world, """MATCH ()-[h:GOSSIPED]->()
        RETURN count(h) AS hops, sum(CASE WHEN h.mutated_field IS NULL THEN 0 ELSE 1 END) AS mutated""")[0]
    reacted = _ro(graphs.world, "MATCH (r:Reaction) RETURN r.tick AS tick, r.villager AS villager, r.rule AS rule "
                                "ORDER BY tick")
    lies = _ro(graphs.case, """MATCH (x:Contradiction) OPTIONAL MATCH (x)-[:IMPLICATES]->(p:Person)
        RETURN x.kind AS kind, x.detail AS detail, p.name AS liar ORDER BY x.tick""")
    return {
        "verdict": json.loads(game["verdict"]),
        "truth": {"killer": killed["killer"], "victim": killed["victim"], "time": hhmm(killed["t"]),
                  "weapon": "the blacksmith's hammer" if killed["weapon"] == "hammer" else killed["weapon"],
                  "place": names.get(killed["place"], killed["place"]), "timeline": [
                      {"time": hhmm(e["t"]), "text": e["text"]} for e in events]},
        "sighting_rumor": [{"from": names.get(h["teller"]), "to": names.get(h["listener"]), "tick": h["tick"],
                            "changed": h["changed"], "before": h["before"], "after": h["after"]} for h in hops],
        "gossip": totals,
        "lies_caught": lies,
        "killer_reacted": [{"tick": r["tick"], "villager": names.get(r["villager"], r["villager"]),
                            "what": REACTION_TEXT.get(r["rule"], r["rule"])} for r in reacted],
    }


def god_view(g: str) -> dict:
    """Every villager's memory side by side (demo only). Strips root_id like everything else."""
    games.touch(g)
    graphs = db.game(g)
    out = {}
    for v in db.VILLAGERS:
        rows = _ro(graphs.npc(v), """
            MATCH (c:Claim) WHERE c.confidence >= 0.2
            OPTIONAL MATCH (c)-[:ABOUT]->(x)
            OPTIONAL MATCH (c)-[:AT]->(pl:Place)
            OPTIONAL MATCH (c)-[:HEARD_FROM]->(s:Person)
            OPTIONAL MATCH (c)-[:INVOLVES]->(o:Object)
            OPTIONAL MATCH (op:Person) WHERE op.id = c.object_id
            RETURN c.id AS id, c.pred AS pred, coalesce(x.name, x.text) AS about, pl.name AS place,
                   coalesce(o.name, op.name) AS object, c.crowns AS crowns, c.note AS note,
                   c.t_from AS t_from, c.t_to AS t_to, c.origin AS origin, c.confidence AS confidence,
                   c.mutated AS mutated, coalesce(c.private, false) AS secret, s.id AS heard_from
            ORDER BY c.salience * c.confidence DESC, id""", label="god view")
        out[v] = {"claims": rows, "heard": sum(r["origin"] == "heard" for r in rows),
                  "mutated": sum(bool(r["mutated"]) for r in rows)}
    return out
