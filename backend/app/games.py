"""Game lifecycle: create (copy the templates), look up, and evict old games.

Games are registered as (:Game) nodes in a small hearsay_meta graph, so they survive a
backend restart. FalkorDB Cloud's tier holds about 6 games (100 MB, noeviction, ~13 MB per
game), so creating one past MAX_GAMES first deletes the game seen least recently.
"""

import json
import os
import secrets
import threading
import time

from app import db, queries
from app.scenario import load_scenario

META = "hearsay_meta"
MAX_GAMES = int(os.getenv("MAX_GAMES", "5"))
_create_lock = threading.Lock()


class GameNotFound(KeyError):
    pass


def _meta(cypher: str, params: dict | None = None, *, readonly: bool = False) -> list[dict]:
    return db.run_cypher(META, cypher, params, label="games meta", readonly=readonly)


def _clock_rules() -> dict:
    return load_scenario()["clock"]


def list_games() -> list[dict]:
    if META not in db.list_graphs():
        return []
    return [r["g"] for r in _meta("MATCH (g:Game) RETURN properties(g) AS g ORDER BY g.last_seen", readonly=True)]


def delete_game(g: str) -> None:
    existing = set(db.list_graphs())
    for name in db.game(g).all():
        if name in existing:
            db.delete_graph(name)
    _meta("MATCH (g:Game {id: $id}) DELETE g", {"id": g})


def create_game() -> dict:
    from app import seed

    if not seed.templates_ready():  # a serverless deploy may never have run the startup seed
        seed.seed(verbose=False)
    with _create_lock:
        live = list_games()
        evicted = []
        while len(live) >= MAX_GAMES:
            oldest = live.pop(0)
            delete_game(oldest["id"])
            evicted.append(oldest["id"])
        g = secrets.token_hex(4)
        now = time.time()
        db.new_game(g)
        _meta("CREATE (:Game {id: $id, created_at: $now, last_seen: $now, session: 1})", {"id": g, "now": now})
    return {"game_id": g, "evicted": evicted, **status(g)}


def touch(g: str) -> dict:
    rows = _meta("MATCH (g:Game {id: $id}) SET g.last_seen = $now RETURN properties(g) AS g",
                 {"id": g, "now": time.time()})
    if not rows:
        raise GameNotFound(g)
    return rows[0]["g"]


def new_session(g: str) -> dict:
    """A returning player: villagers can tell a new visit from a follow-up question."""
    touch(g)
    _meta("MATCH (x:Game {id: $id}) SET x.session = x.session + 1", {"id": g})
    return status(g)


def status(g: str) -> dict:
    """Clock and questions left. Each question is one gossip tick after the pre-game ones."""
    game = touch(g)
    rules = _clock_rules()
    tick = db.run_cypher(db.game(g).world, "MATCH (k:Clock) RETURN k.tick AS tick",
                         label="games clock", readonly=True)[0]["tick"]
    asked = tick - rules["pregame_ticks"]
    total = (rules["day_end"] - rules["day_start"]) // rules["minutes_per_question"]
    now = rules["day_start"] + asked * rules["minutes_per_question"]
    return {"game_id": g, "session": game["session"], "tick": tick, "questions_asked": asked,
            "questions_left": max(total - asked, 0), "clock": f"{now // 60 % 24:02d}:{now % 60:02d}"}


def circles(g: str) -> list[dict]:
    """Q5 once per game, cached on the Game node: label propagation can vary between runs."""
    cached = _meta("MATCH (g:Game {id: $id}) RETURN g.circles AS c", {"id": g}, readonly=True)
    if not cached:
        raise GameNotFound(g)
    if cached[0]["c"]:
        return json.loads(cached[0]["c"])
    rows = db.run(db.game(g).village, "q05_circles")
    result = [{"community": r["communityId"], "members": r["circle"]} for r in rows]
    _meta("MATCH (g:Game {id: $id}) SET g.circles = $c", {"id": g, "c": json.dumps(result)})
    return result


def village(g: str) -> dict:
    touch(g)
    graph = db.game(g).village

    def ro(cypher: str) -> list[dict]:
        return db.run_cypher(graph, cypher, label="api village", readonly=True)

    people = ro("""
        MATCH (p:Person)
        OPTIONAL MATCH (p)-[:LIVES_AT]->(home:Place)
        OPTIONAL MATCH (p)-[:WORKS_AT]->(work:Place)
        RETURN p.id AS id, p.name AS name, p.role AS role, p.sex AS sex, p.adult AS adult,
               p.build AS build, home.id AS lives_at, work.id AS works_at
        ORDER BY id""")
    places = ro("MATCH (p:Place) RETURN p.id AS id, p.name AS name ORDER BY id")
    roads = ro("MATCH (a:Place)-[r:ROAD]->(b:Place) WHERE a.id < b.id "
               "RETURN a.id AS a, b.id AS b, r.minutes AS minutes ORDER BY a, b")
    knows = ro("MATCH (a:Person)-[k:KNOWS]->(b:Person) WHERE a.id < b.id "
               "RETURN a.id AS a, b.id AS b, k.closeness AS closeness ORDER BY a, b")
    facts = ro("MATCH (f:Fact) RETURN f.id AS id, f.text AS text ORDER BY id")
    names = {p["name"]: p["id"] for p in people}
    hubs = [{"id": names.get(r["villager"]), "name": r["villager"], "score": r["score"]}
            for r in db.run(graph, "q04_gossip_hubs")]
    return {"game_id": g, "people": people, "places": places, "roads": roads, "knows": knows,
            "facts": facts, "gossip_hubs": hubs, "circles": circles(g),
            "cypher": {"gossip_hubs": queries.load("q04_gossip_hubs"), "circles": queries.load("q05_circles")}}

