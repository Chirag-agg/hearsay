"""Gossip ticks: plan sequentially with a seeded RNG, then write in parallel.

One tick = 30 in-game minutes. In the plan phase, every villager's state is read once at the
start of the tick, then villagers take turns in seeded order and every random draw happens
here (who talks, which claims via Q2, which detail mutates), producing a list of hops. A
teller only retells claims it held when the tick began, so a rumor moves at most one hop per
tick. In the write phase, hops go to their listeners' graphs in parallel (one task per graph,
under that graph's lock), then the hops are logged as GOSSIPED edges in the truth graph.

The same seed always gives the same village: the RNG for tick t is seeded from (seed, t),
villagers and neighbours are walked in sorted-then-shuffled order, Q2 breaks ties on c.id,
and claim ids are uuid5 of (seed, tick, teller, listener, rumor, parent claim).
"""

import random
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from app import db
from app.scenario import desc_attrs, desc_id

ID_NAMESPACE = uuid.UUID("6f1c2a52-3c1e-4c55-9a5e-48ea5a0b7d11")
HOP_DECAY = 0.9
COPIED_FIELDS = ("root_id", "pred", "subject_id", "place_id", "object_id", "toward_id",
                 "t_from", "t_to", "confidence", "salience", "crowns", "note")


def seeded_id(seed: int, tick: int, teller: str, listener: str, root_id: str, parent_id: str) -> str:
    key = "|".join(str(x) for x in (seed, tick, teller, listener, root_id, parent_id))
    return "h_" + uuid.uuid5(ID_NAMESPACE, key).hex[:16]


def hhmm(t: int) -> str:
    return f"{t // 60 % 24:02d}:{t % 60:02d}"


def when(claim: dict) -> str:
    """A point event (10-minute window) reads as its middle, 21:30; a span as its start."""
    t = claim["t_from"] + 5 if claim["t_to"] - claim["t_from"] == 10 else claim["t_from"]
    return hhmm(t)


@dataclass
class Village:
    """The static public map and social web, read once per run."""

    knows: dict[str, list[tuple[str, float]]]
    people: dict[str, dict]
    names: dict[str, str]
    neighbours: dict[str, list[str]]
    place_names: dict[str, str]
    objects: set[str]

    @classmethod
    def read(cls, graphs: db.Graphs) -> "Village":
        def ro(cypher):
            return db.run_cypher(graphs.village, cypher, label="engine village", readonly=True)

        knows: dict[str, list[tuple[str, float]]] = {}
        for r in ro("MATCH (a:Person)-[k:KNOWS]->(b:Person) RETURN a.id AS a, b.id AS b, k.closeness AS c "
                    "ORDER BY a, b"):
            knows.setdefault(r["a"], []).append((r["b"], r["c"]))
        people = {r["id"]: r for r in ro("MATCH (p:Person) RETURN p.id AS id, p.name AS name, "
                                         "p.sex AS sex, p.adult AS adult")}
        neighbours: dict[str, list[str]] = {}
        for r in ro("MATCH (a:Place)-[:ROAD]->(b:Place) RETURN a.id AS a, b.id AS b ORDER BY a, b"):
            neighbours.setdefault(r["a"], []).append(r["b"])
        places = {r["id"]: r["name"] for r in ro("MATCH (p:Place) RETURN p.id AS id, p.name AS name")}
        objects = {r["id"] for r in db.run_cypher(graphs.npc(db.VILLAGERS[0]), "MATCH (o:Object) RETURN o.id AS id",
                                                  label="engine objects", readonly=True)}
        return cls(knows, people, {k: v["name"] for k, v in people.items()}, neighbours, places, objects)


@dataclass
class Mind:
    """One villager's state at the start of a tick."""

    id: str
    accuracy: float
    talkativeness: float
    bias: list[str]
    trusts: dict[str, float]
    roots: set[str]


@dataclass
class Hop:
    teller: str
    listener: str
    tick: int
    claim: dict
    parent: dict
    mutated_field: str | None = None
    before: str | None = None
    after: str | None = None
    descriptions: list[dict] = field(default_factory=list)


def read_mind(graph: str) -> Mind:
    r = db.run_cypher(graph, """
        MATCH (s:Self)
        OPTIONAL MATCH (s)-[t:TRUSTS]->(p:Person)
        WITH s, collect([p.id, t.score]) AS trusts
        OPTIONAL MATCH (c:Claim)
        RETURN s.id AS id, s.accuracy AS accuracy, s.talkativeness AS talkativeness,
               s.mutation_bias AS bias, trusts, collect(DISTINCT c.root_id) AS roots
        """, label="engine mind", readonly=True)[0]
    trusts = {pid: score for pid, score in r["trusts"] if pid is not None}
    return Mind(r["id"], r["accuracy"], r["talkativeness"], list(r["bias"]), trusts, set(r["roots"]))


def _blur(subject_id: str, village: Village, rng: random.Random) -> tuple[str, str, str] | None:
    """A name becomes a description ("Jonas" -> "a man"); a description changes one attribute."""
    if subject_id in village.people:
        p = village.people[subject_id]
        new = desc_id(p["sex"], p["adult"])
        return new, p["name"], desc_attrs(new)["text"]
    attrs = desc_attrs(subject_id)
    change = rng.choice(["sex", "carrying"] if attrs["carrying"] else ["sex"])
    if change == "sex":
        new = desc_id("f" if attrs["sex"] == "m" else "m", attrs["adult"], attrs["carrying"])
    else:
        new = desc_id(attrs["sex"], attrs["adult"])
    return new, attrs["text"], desc_attrs(new)["text"]


def retell(parent: dict, teller: Mind, listener: Mind, tick: int, seed: int,
           village: Village, rng: random.Random) -> Hop:
    claim = {k: parent[k] for k in COPIED_FIELDS if parent.get(k) is not None}
    claim.update(id=seeded_id(seed, tick, teller.id, listener.id, parent["root_id"], parent["id"]),
                 parent_id=parent["id"], origin="heard", private=False)
    claim["confidence"] = round(parent["confidence"] * listener.trusts.get(teller.id, 0.0) * HOP_DECAY, 4)
    hop = Hop(teller.id, listener.id, tick, claim, parent)

    if rng.random() > teller.accuracy:
        choice = rng.choice(teller.bias)
        if choice == "t":
            d = rng.choice([-30, 30])
            hop.before = when(claim)
            claim["t_from"] += d
            claim["t_to"] += d
            hop.after = when(claim)
            hop.mutated_field = "t"
        elif choice == "place" and village.neighbours.get(claim.get("place_id")):
            new = rng.choice(village.neighbours[claim["place_id"]])
            hop.before, hop.after = village.place_names[claim["place_id"]], village.place_names[new]
            claim["place_id"] = new
            hop.mutated_field = "place"
        elif choice == "subject":
            new, hop.before, hop.after = _blur(claim["subject_id"], village, rng)
            claim["subject_id"] = new
            hop.mutated_field = "subject"
    if hop.mutated_field:
        claim["mutated"] = hop.mutated_field
    if claim["subject_id"] not in village.people:
        hop.descriptions.append(desc_attrs(claim["subject_id"]))
    return hop


def plan_tick(graphs: db.Graphs, tick: int, seed: int, village: Village) -> list[Hop]:
    with ThreadPoolExecutor(max_workers=len(db.VILLAGERS)) as pool:  # reads only; order doesn't matter
        minds = dict(zip(db.VILLAGERS, pool.map(read_mind, [graphs.npc(v) for v in db.VILLAGERS])))
    rng = random.Random(f"hearsay:{seed}:{tick}")
    order = sorted(db.VILLAGERS)
    rng.shuffle(order)
    holds = {v: set(m.roots) for v, m in minds.items()}  # what each listener holds, plus what's planned for it
    hops: list[Hop] = []
    for teller_id in order:
        teller = minds[teller_id]
        for listener_id, closeness in village.knows.get(teller_id, []):
            if listener_id not in minds:
                continue
            if rng.random() >= closeness * teller.talkativeness:
                continue
            rows = db.run(graphs.npc(teller_id), "q02_next_gossip", {"listener_roots": sorted(holds[listener_id])})
            for row in rows:
                hop = retell(row["c"].properties, teller, minds[listener_id], tick, seed, village, rng)
                holds[listener_id].add(hop.claim["root_id"])
                hops.append(hop)
    return hops


def _write_listener(graph: str, hops: list[Hop], objects: set[str]) -> None:
    descriptions = {d["id"]: d for h in hops for d in h.descriptions}
    claims = [h.claim for h in hops]
    with db.graph_lock(graph):
        if descriptions:
            db.run_cypher(graph, """
                UNWIND $rows AS d
                MERGE (x:Description {id: d.id})
                ON CREATE SET x.text = d.text, x.sex = d.sex, x.adult = d.adult, x.carrying = d.carrying
                """, {"rows": sorted(descriptions.values(), key=lambda d: d["id"])}, label="engine descriptions")
        db.create_nodes(graph, "Claim", claims)
        db.create_edges(graph, "ABOUT", "Claim", "Person",
                        [(c["id"], c["subject_id"], {}) for c in claims if c["subject_id"] not in descriptions])
        db.create_edges(graph, "ABOUT", "Claim", "Description",
                        [(c["id"], c["subject_id"], {}) for c in claims if c["subject_id"] in descriptions])
        db.create_edges(graph, "AT", "Claim", "Place", [(c["id"], c["place_id"], {}) for c in claims if c.get("place_id")])
        db.create_edges(graph, "INVOLVES", "Claim", "Object",
                        [(c["id"], c["object_id"], {}) for c in claims if c.get("object_id") in objects])
        db.create_edges(graph, "HEARD_FROM", "Claim", "Person", [(h.claim["id"], h.teller, {"tick": h.tick}) for h in hops])


def write_tick(graphs: db.Graphs, hops: list[Hop], village: Village) -> None:
    by_listener: dict[str, list[Hop]] = {}
    for h in hops:
        by_listener.setdefault(h.listener, []).append(h)
    with ThreadPoolExecutor(max_workers=len(db.VILLAGERS)) as pool:
        futures = [pool.submit(_write_listener, graphs.npc(v), hs, village.objects) for v, hs in by_listener.items()]
        for f in futures:
            f.result()
    log = [(h.teller, h.listener, {k: v for k, v in {
        "tick": h.tick, "root_id": h.claim["root_id"], "claim_id": h.claim["id"], "parent_id": h.parent["id"],
        "mutated_field": h.mutated_field, "before": h.before, "after": h.after}.items() if v is not None})
        for h in hops]
    with db.graph_lock(graphs.world):
        db.create_edges(graphs.world, "GOSSIPED", "Person", "Person", log)


def clock(graphs: db.Graphs) -> dict:
    return db.run_cypher(graphs.world, "MATCH (k:Clock) RETURN k.tick AS tick, k.seed AS seed",
                         label="engine clock", readonly=True)[0]


def run_ticks(graphs: db.Graphs, n: int) -> list[Hop]:
    """Run n gossip ticks on this set of graphs, continuing from its Clock. Returns every hop."""
    state = clock(graphs)
    village = Village.read(graphs)
    all_hops: list[Hop] = []
    for tick in range(state["tick"] + 1, state["tick"] + n + 1):
        hops = plan_tick(graphs, tick, state["seed"], village)
        write_tick(graphs, hops, village)
        db.run_cypher(graphs.world, "MATCH (k:Clock) SET k.tick = $tick", {"tick": tick}, label="engine clock")
        all_hops.extend(hops)
    return all_hops
