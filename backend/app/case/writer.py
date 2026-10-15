"""Write an answer onto the case board (game_<g>_case).

Each answer becomes a Statement SAID_BY the villager, ASSERTING one case Claim per claim the
answer cited. A claim is reported_as 'saw' (witnessed, or a liar's own story) or 'heard'.
Heard claims get SOURCED_FROM their teller's source, and DERIVED_FROM links to the source's
own claim of the same rumor once the source has been asked (root_id, backend-only).
Descriptions ("a man with a lantern") are merged in and FITS every person who matches them.
"""

import uuid

from app import db
from app.engine.gossip import ID_NAMESPACE
from app.scenario import desc_attrs, load_scenario

CASE_FILE = load_scenario()["case_file"]
BACKEND_ONLY = ("root_id", "source_claim")  # stripped from every API and MCP result
CASE_FIELDS = ("id", "root_id", "source_claim", "pred", "subject_id", "place_id", "object_id", "toward_id",
               "t_from", "t_to", "teller_id", "reported_as", "confidence", "crowns", "note")


def seeded(prefix: str, *parts) -> str:
    return prefix + uuid.uuid5(ID_NAMESPACE, "|".join(str(p) for p in parts)).hex[:12]


def public(claim: dict) -> dict:
    return {k: v for k, v in claim.items() if k not in BACKEND_ONLY}


def write_statement(graphs: db.Graphs, villager_id: str, question: str, answer: dict, *,
                    tick: int, session: int, seed: int) -> dict:
    graph = graphs.case
    used = {cid: i for i, cid in enumerate(answer["claim_ids_used"])}
    cited = sorted((c for c in answer["claims"] if c["claim_id"] in used), key=lambda c: used[c["claim_id"]])
    sid = seeded("s_", seed, tick, villager_id, question)
    claims = []
    for c in cited:
        row = {**c, "id": seeded("k_", seed, tick, villager_id, c["claim_id"]), "source_claim": c["claim_id"],
               "teller_id": villager_id, "reported_as": "heard" if c["origin"] == "heard" else "saw"}
        claims.append({k: row[k] for k in CASE_FIELDS if row.get(k) is not None})
    people = {r["id"] for r in db.run_cypher(graph, "MATCH (p:Person) RETURN p.id AS id", label="case people",
                                             readonly=True)}
    descriptions = sorted({c["subject_id"] for c in claims if c["subject_id"] not in people})

    with db.graph_lock(graph):
        db.create_nodes(graph, "Statement", [{"id": sid, "text": answer["dialogue"], "question": question,
                                              "villager": villager_id, "session": session, "tick": tick}])
        db.create_edges(graph, "SAID_BY", "Statement", "Person", [(sid, villager_id, {})])
        db.create_nodes(graph, "Claim", claims)
        db.create_edges(graph, "ASSERTS", "Statement", "Claim", [(sid, c["id"], {}) for c in claims])
        if descriptions:
            db.run_cypher(graph, """
                UNWIND $rows AS d
                MERGE (x:Description {id: d.id})
                ON CREATE SET x.text = d.text, x.sex = d.sex, x.adult = d.adult, x.carrying = d.carrying
                WITH x
                MATCH (p:Person) WHERE p.sex = x.sex AND p.adult = x.adult AND p.id <> $victim
                WITH x, p
                MERGE (x)-[:FITS]->(p)
                """, {"rows": [desc_attrs(d) for d in descriptions], "victim": CASE_FILE["victim"]},
                label="case descriptions")
        db.create_edges(graph, "ABOUT", "Claim", "Person",
                        [(c["id"], c["subject_id"], {}) for c in claims if c["subject_id"] in people])
        db.create_edges(graph, "ABOUT", "Claim", "Description",
                        [(c["id"], c["subject_id"], {}) for c in claims if c["subject_id"] not in people])
        db.create_edges(graph, "AT", "Claim", "Place", [(c["id"], c["place_id"], {}) for c in claims if c.get("place_id")])
        db.create_edges(graph, "SOURCED_FROM", "Claim", "Person",
                        [(k["id"], c["heard_from_id"], {}) for k, c in zip(claims, cited)
                         if k["reported_as"] == "heard" and c.get("heard_from_id")])
        link_derived(graph)
    return {"statement_id": sid, "claims": claims}


def link_derived(graph: str) -> None:
    """A heard claim DERIVED_FROM its source's own claim of the same rumor, whichever was asked first."""
    db.run_cypher(graph, """
        MATCH (c:Claim)-[:SOURCED_FROM]->(src:Person)
        MATCH (p:Claim)
        WHERE p.teller_id = src.id AND p.root_id = c.root_id AND p.id <> c.id
        WITH c, p
        MERGE (c)-[:DERIVED_FROM]->(p)
        """, label="case link DERIVED_FROM")
