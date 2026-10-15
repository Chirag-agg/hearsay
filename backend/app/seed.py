"""Build the tpl_* template graphs and run the pre-game gossip on them.

    python -m app.seed            (from backend/; scripts/seed.py calls this too)

Idempotent: deletes every tpl_* graph and rebuilds tpl_world, tpl_village, tpl_case and one
tpl_npc_<id> per villager, each with the indexes from indexes.cypher. Then it runs the 12
pre-game gossip ticks with GAME_SEED. The same seed always gives the same village, so running
them once here gives every game the same morning, and POST /games only has to copy 13 graphs.
"""

import os
import time

from app import db
from app.engine import gossip
from app.scenario import load_scenario
from app.scenario.loader import build_templates


def seed(verbose: bool = True) -> dict:
    scenario = load_scenario()
    seed_value = int(os.getenv("GAME_SEED", "42"))
    start = time.perf_counter()
    names = build_templates(scenario, seed_value)
    built = time.perf_counter()
    hops = gossip.run_ticks(db.TEMPLATES, scenario["clock"]["pregame_ticks"])
    done = time.perf_counter()
    if verbose:
        for name in names:
            nodes = db.run_cypher(name, "MATCH (n) RETURN count(n) AS n", label="seed count", readonly=True)[0]["n"]
            edges = db.run_cypher(name, "MATCH ()-[e]->() RETURN count(e) AS n", label="seed count", readonly=True)[0]["n"]
            print(f"{name:<16} {nodes:>4} nodes {edges:>4} edges")
        print(f"seeded {len(names)} template graphs from {scenario['id']} in {built - start:.1f} s; "
              f"{scenario['clock']['pregame_ticks']} gossip ticks (seed {seed_value}): {len(hops)} hops, "
              f"{sum(1 for h in hops if h.mutated_field)} mutated, {done - built:.1f} s")
    return {"graphs": names, "hops": len(hops), "seconds": round(done - start, 1)}


def templates_ready() -> bool:
    return set(db.TEMPLATES.all()) <= set(db.list_graphs())


if __name__ == "__main__":
    seed()
