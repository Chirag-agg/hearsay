"""Build the tpl_* template graphs from backend/app/scenario/hollowmere.json.

    python scripts/seed.py

Idempotent: deletes every tpl_* graph and rebuilds tpl_world, tpl_village, tpl_case
and one tpl_npc_<id> per villager, each with the indexes from indexes.cypher.

Then it runs the 12 pre-game gossip ticks on the templates with GAME_SEED. The same seed
always gives the same village, so running them once here gives every game the same
morning as running them per game would, and POST /games only has to copy 13 graphs.
Change GAME_SEED and run this again for a different morning.
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db  # noqa: E402
from app.engine import gossip  # noqa: E402
from app.scenario import load_scenario  # noqa: E402
from app.scenario.loader import build_templates  # noqa: E402


def main() -> None:
    scenario = load_scenario()
    seed = int(os.getenv("GAME_SEED", "42"))
    start = time.perf_counter()
    names = build_templates(scenario, seed)
    built = time.perf_counter()
    hops = gossip.run_ticks(db.TEMPLATES, scenario["clock"]["pregame_ticks"])
    mutated = sum(1 for h in hops if h.mutated_field)
    for name in names:
        nodes = db.run_cypher(name, "MATCH (n) RETURN count(n) AS n", label="seed count", readonly=True)[0]["n"]
        edges = db.run_cypher(name, "MATCH ()-[e]->() RETURN count(e) AS n", label="seed count", readonly=True)[0]["n"]
        print(f"{name:<16} {nodes:>4} nodes {edges:>4} edges")
    print(f"seeded {len(names)} template graphs from {scenario['id']} in {built - start:.1f} s; "
          f"{scenario['clock']['pregame_ticks']} gossip ticks (seed {seed}): {len(hops)} hops, {mutated} mutated, "
          f"{time.perf_counter() - built:.1f} s")


if __name__ == "__main__":
    main()
