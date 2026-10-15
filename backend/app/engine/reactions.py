"""The killer reacts (stretch): questions become gossip, and gossip can switch a liar's rule on.

When the player asks about something a rule watches (the hammer; Father Aldric being asked when
Elena left the Chapel), the villager being questioned stores "the detective asked about X" as a
high-salience claim (pred ASKED, object_id = the topic). It spreads like any other gossip. After
every tick, a liar holding such a claim gets the matching rule switched on through W2:

  hammer            -> rule_elena_frame_jonas  (plants "Jonas carried his hammer to the Mill, 20:45")
  chapel_departure  -> rule_elena_change_story (switches to "I left at 21:00 and went home")

KILLER_REACTS=0 turns it off (replay_demo.py does, to keep to the core solving path).
"""

import os
import re
import uuid
from functools import cache

from app import db
from app.engine.gossip import ID_NAMESPACE
from app.scenario import load_scenario

HAMMER = re.compile(r"\b(hammer|weapon)\b", re.I)
LEAVING = re.compile(r"\b(leave|left|leaving|chapel|prayer)\b", re.I)


def enabled() -> bool:
    return os.getenv("KILLER_REACTS", "1") == "1"


def topics(villager_id: str, question: str, parsed: dict) -> list[tuple[str, str]]:
    """(topic, what the villager will repeat) for each watched topic this question touches."""
    found = []
    if HAMMER.search(question):
        found.append(("hammer", "the detective asked about the blacksmith's hammer"))
    if villager_id == "aldric" and "elena" in parsed.get("person_ids", []) and LEAVING.search(question):
        found.append(("chapel_departure", "the detective asked Father Aldric when Elena left the Chapel"))
    return found


def record_question(graphs: db.Graphs, villager_id: str, question: str, parsed: dict, *, tick: int,
                    seed: int, now: int) -> list[str]:
    """Store "the detective asked about X" in the questioned villager's own graph."""
    if not enabled():
        return []
    rows = []
    for topic, note in topics(villager_id, question, parsed):
        cid = "x_" + uuid.uuid5(ID_NAMESPACE, f"{seed}|{tick}|{villager_id}|{topic}").hex[:16]
        rows.append({"id": cid, "root_id": cid, "pred": "ASKED", "subject_id": villager_id, "object_id": topic,
                     "t_from": now, "t_to": now + 10, "confidence": 1.0, "salience": 1.0, "origin": "witnessed",
                     "private": False, "note": note})
    if rows:
        graph = graphs.npc(villager_id)
        with db.graph_lock(graph):
            db.create_nodes(graph, "Claim", rows)
            db.create_edges(graph, "ABOUT", "Claim", "Person", [(r["id"], villager_id, {}) for r in rows])
            db.create_edges(graph, "WITNESSED", "Self", "Claim", [(villager_id, r["id"], {"tick": tick}) for r in rows])
    return [r["object_id"] for r in rows]


@cache
def watchers() -> list[str]:
    """Villagers with a rule that listens for the detective's questions (Elena, in the demo case)."""
    return [v["id"] for v in load_scenario()["villagers"]
            if any(r.get("trigger") == "heard_detective_asked" for r in v.get("rules", []))]


def react(graphs: db.Graphs) -> list[dict]:
    """Switch on every rule whose trigger the villager has now heard about. Returns what fired."""
    if not enabled():
        return []
    fired = []
    for v in watchers():
        graph = graphs.npc(v)
        rules = db.run_cypher(graph, """
            MATCH (r:Rule {trigger: 'heard_detective_asked'}) WHERE r.active = false
            MATCH (c:Claim {pred: 'ASKED'})
            WHERE c.object_id = r.topic AND (r.asked_of IS NULL OR c.subject_id = r.asked_of) AND c.confidence >= 0.2
            RETURN DISTINCT r.id AS rule""", label="killer reacts check", readonly=True)
        for r in rules:
            with db.graph_lock(graph):
                out = db.run(graph, "w02_activate_rule", {"rule_id": r["rule"]})
            fired.append({"villager": v, "rule": r["rule"], "superseded": out[0]["superseded"] if out else None})
    return fired
