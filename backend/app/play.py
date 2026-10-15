"""One interrogation, start to finish, plus the case views built on it.

ask():  villager agent answers from its own graph -> episodic memory written back to that
        graph -> Statement and Claims onto the case board -> contradiction checks, IMPLICATES,
        alibis -> one gossip tick (the village keeps talking) -> events out.
Every result strips root_id: only the backend can group rumors.
"""

import re

from app import db, events, games
from app.case import checks, writer
from app.engine import gossip
from app.engine.gossip import hhmm
from app.npc.agent import Villager
from app.npc.render import sentence

ACCUSATORY = re.compile(r"\b(liar|lying|lied|lie|killed|killer|murder\w*|guilty|you did it)\b", re.I)
TRUST_DROP = 0.1


class OutOfTime(RuntimeError):
    pass


class BadRequest(ValueError):
    pass


def _remember(graph: str, player: str, session: int, tick: int, question: str, claim_ids: list[str],
              accusatory: bool) -> float | None:
    """Episodic memory in the villager's own graph; trust drops after an accusatory question."""
    with db.graph_lock(graph):
        db.run_cypher(graph, """
            MATCH (s:Self)
            MERGE (s)-[:HAD]->(conv:Conversation {player_id: $player, session: $session})
            ON CREATE SET conv.tick = $tick
            CREATE (conv)-[:INCLUDED]->(:Question {text: $text, tick: $tick, accusatory: $accusatory})
            """, {"player": player, "session": session, "tick": tick, "text": question, "accusatory": accusatory},
            label="agent remember question")
        if claim_ids:
            db.run_cypher(graph, """
                MATCH (q:Question {tick: $tick, text: $text})
                UNWIND $claims AS cid
                MATCH (c:Claim {id: cid})
                CREATE (q)-[:ANSWERED_WITH]->(c)
                """, {"tick": tick, "text": question, "claims": claim_ids}, label="agent remember answer")
        if accusatory:
            return db.run_cypher(graph, """
                MATCH (s:Self)
                SET s.player_trust = CASE WHEN s.player_trust > $drop THEN s.player_trust - $drop ELSE 0.0 END
                RETURN s.player_trust AS trust""", {"drop": TRUST_DROP}, label="agent trust drop")[0]["trust"]
    return None


def _called_a_liar_before(graph: str, player: str, session: int) -> bool:
    rows = db.run_cypher(graph, """
        MATCH (:Self)-[:HAD]->(conv:Conversation {player_id: $player})-[:INCLUDED]->(q:Question)
        RETURN conv.session AS session, q.accusatory AS accusatory""", {"player": player},
        label="agent past accusations", readonly=True)
    earlier = any(r["accusatory"] and r["session"] < session for r in rows)
    asked_this_session = any(r["session"] == session for r in rows)
    return earlier and not asked_this_session


def _cites(graph: str, statement_ids: list[str]) -> list[tuple]:
    if not statement_ids:
        return []
    rows = db.run_cypher(graph, """
        MATCH (s:Statement)-[:ASSERTS]->(c:Claim) WHERE s.id IN $ids
        RETURN c.pred AS pred, c.subject_id AS subject, c.toward_id AS toward""",
        {"ids": list(statement_ids)}, label="case cited statements", readonly=True)
    return [(r["pred"], r["subject"], r["toward"]) for r in rows]


def _case_claim(graph: str, claim_id: str) -> dict:
    rows = db.run_cypher(graph, "MATCH (c:Claim {id: $id}) RETURN properties(c) AS c", {"id": claim_id},
                         label="case claim", readonly=True)
    if not rows:
        raise BadRequest(f"no claim {claim_id!r} on the case board")
    return rows[0]["c"]


def _chips(answer: dict, written: dict, self_id: str, pronouns: dict) -> list[dict]:
    """The claim chips the UI shows under an answer (case claim ids, never root_id)."""
    by_npc = {c["claim_id"]: c for c in answer["claims"]}
    chips = []
    for k in written["claims"]:
        c = by_npc[k["source_claim"]]
        chips.append({"claim_id": k["id"], "label": sentence(c, self_id, pronouns), "pred": k["pred"],
                      "about": c.get("who"), "place": c.get("place"), "t_from": k["t_from"], "t_to": k["t_to"],
                      "reported_as": k["reported_as"], "heard_from": c.get("heard_from") if k["reported_as"] == "heard" else None,
                      "can_ask_source": k["reported_as"] == "heard"})
    return chips


def ask(g: str, villager_id: str, question: str, *, cite_statement_ids: list[str] = (),
        about_claim_id: str | None = None, player_id: str = "p1") -> dict:
    if villager_id not in db.VILLAGERS:
        raise BadRequest(f"no villager {villager_id!r}")
    before = games.status(g)
    if before["questions_left"] <= 0:
        raise OutOfTime("the day is over: no questions left")
    graphs = db.game(g)
    clock = gossip.clock(graphs)
    tick, seed, session = clock["tick"], clock["seed"], before["session"]

    root_id = _case_claim(graphs.case, about_claim_id)["root_id"] if about_claim_id else None
    agent = Villager(villager_id, graphs, player_id)
    answer = agent.ask(question, cites=_cites(graphs.case, list(cite_statement_ids)), root_id=root_id)
    if _called_a_liar_before(graphs.npc(villager_id), player_id, session):
        answer["dialogue"] = f"You again. Last time you called me a liar. {answer['dialogue']}"

    accusatory = bool(ACCUSATORY.search(question))
    trust = _remember(graphs.npc(villager_id), player_id, session, tick, question, answer["claim_ids_used"], accusatory)
    written = writer.write_statement(graphs, villager_id, question, answer, tick=tick, session=session, seed=seed)
    found = checks.run_checks(graphs, tick)
    hops = gossip.run_ticks(graphs, 1)
    after = games.status(g)

    out_events = [{"type": "contradiction_found", "kind": c["kind"], "detail": c["detail"], "key": c["key"],
                   "statements": [c["stmt_1"], c["stmt_2"]]} for c in found["new"]]
    if hops:
        out_events.append({"type": "rumor_spread", "hops": len(hops), "mutated": sum(1 for h in hops if h.mutated_field),
                           "tick": after["tick"]})
    if trust is not None:
        out_events.append({"type": "mood_changed", "villager": villager_id, "trust": trust})
    out_events.append({"type": "clock_tick", "clock": after["clock"], "questions_left": after["questions_left"]})
    published = events.publish(g, out_events)

    return {"statement_id": written["statement_id"], "villager": villager_id, "name": answer["name"],
            "question": question, "dialogue": answer["dialogue"], "emotion": answer["emotion"],
            "mode": answer["mode"], "guardrail_ok": not answer["guardrail"],
            "claims": _chips(answer, written, villager_id, agent.pronouns),
            "withheld": len(answer["withheld"]), "contradictions_new": found["new"],
            "events": published, "status": after}


def source(g: str, claim_id: str) -> dict:
    """The "Who told you?" button (Q3 on the teller's own graph). Free; asking the source costs a question."""
    games.touch(g)
    graphs = db.game(g)
    claim = _case_claim(graphs.case, claim_id)
    if claim["reported_as"] != "heard":
        return {"claim_id": claim_id, "teller": claim["teller_id"], "source": None,
                "dialogue": "Nobody told me. I saw it myself."}
    rows = db.run(graphs.npc(claim["teller_id"]), "q03_who_told_me", {"claim_id": claim["source_claim"]})
    if not rows:
        return {"claim_id": claim_id, "teller": claim["teller_id"], "source": None, "dialogue": "I can't recall who."}
    return {"claim_id": claim_id, "teller": claim["teller_id"], "source": rows[0]["source_id"],
            "source_name": rows[0]["source"], "dialogue": f"I heard it from {rows[0]['source']}.",
            "ask_next": {"villager_id": rows[0]["source_id"], "about_claim_id": claim_id}}


def trace(g: str, claim_id: str) -> dict:
    """Q7: the rumor chain back to its origin, with what changed at each hop."""
    games.touch(g)
    graph = db.game(g).case
    rows = db.run(graph, "q07_trace_rumor", {"claim_id": claim_id})
    if not rows:
        raise BadRequest(f"no claim {claim_id!r} on the case board")
    names = {r["id"]: r["name"] for r in db.run_cypher(graph, """
        MATCH (n) WHERE n:Person OR n:Place RETURN n.id AS id, n.name AS name
        UNION MATCH (d:Description) RETURN d.id AS id, d.text AS name""", label="case names", readonly=True)}
    chain, prev = [], None
    for hop in rows[0]["chain"]:
        step = {"claim_id": hop["claim"], "teller": hop["teller"], "teller_name": names.get(hop["teller"]),
                "about": names.get(hop["about"], hop["about"]), "place": names.get(hop["place"], hop["place"]),
                "time": hhmm(hop["t_from"] + 5), "reported_as": hop["reported_as"], "changed": []}
        if prev:
            step["changed"] = [k for k in ("about", "place", "time") if step[k] != prev[k]]
        chain.append(step)
        prev = step
    return {"claim_id": claim_id, "chain": chain, "reached_eyewitness": rows[0]["reached_eyewitness"],
            "ask_next": rows[0]["ask_next"]}


def contradictions(g: str) -> dict:
    games.touch(g)
    graph = db.game(g).case
    rows = db.run_cypher(graph, """
        MATCH (x:Contradiction)
        OPTIONAL MATCH (x)-[:IMPLICATES]->(p:Person)
        RETURN x.key AS key, x.kind AS kind, x.detail AS detail, x.tick AS tick,
               x.claim_1 AS claim_1, x.claim_2 AS claim_2, p.id AS implicates, p.name AS implicates_name
        ORDER BY tick, key""", label="api contradictions", readonly=True)
    return {"contradictions": rows, "leads": db.run(graph, "q08b_leads")}


def suspects(g: str, sighting: str | None = None) -> dict:
    games.touch(g)
    graph = db.game(g).case
    held = sighting or checks.current_sighting(graph)
    text = None
    if held:
        found = db.run_cypher(graph, "MATCH (d:Description {id: $id}) RETURN d.text AS t", {"id": held},
                              label="case sighting text", readonly=True)
        text = found[0]["t"] if found else None
    return {"sighting": held, "sighting_text": text, "ranking": checks.rank_suspects(graph, held)}


def case_board(g: str) -> dict:
    """Nodes and links for the force-directed case board. root_id and source_claim are left out."""
    games.touch(g)
    graph = db.game(g).case
    nodes = db.run_cypher(graph, """
        MATCH (n) WHERE NOT n:Place
        RETURN labels(n)[0] AS kind, properties(n) AS p""", label="api case nodes", readonly=True)
    links = db.run_cypher(graph, """
        MATCH (a)-[e]->(b)
        WHERE NOT type(e) IN ['ROAD'] AND NOT a:Place AND NOT b:Place
        RETURN coalesce(a.id, a.key) AS source, coalesce(b.id, b.key) AS target, type(e) AS type""",
        label="api case links", readonly=True)
    out = []
    for n in nodes:
        p = {k: v for k, v in n["p"].items() if k not in writer.BACKEND_ONLY}
        out.append({"id": p.get("id") or p.get("key"), "kind": n["kind"], **p})
    return {"nodes": out, "links": links}
