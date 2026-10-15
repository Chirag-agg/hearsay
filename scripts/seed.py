"""Build the tpl_* template graphs from backend/app/scenario/hollowmere.json.

    python scripts/seed.py

Idempotent: deletes every tpl_* graph and rebuilds tpl_world, tpl_village, tpl_case
and one tpl_npc_<id> per villager, each with the indexes from indexes.cypher.
The 12 pre-game gossip ticks are not run here; they run per game in POST /games.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db as dbmod  # noqa: E402
from app.scenario import load_scenario  # noqa: E402
from app.scenario.loader import build_templates  # noqa: E402


def main() -> None:
    scenario = load_scenario()
    graphs = build_templates(dbmod.connect(), scenario)
    for name, g in graphs.items():
        nodes = g.ro_query("MATCH (n) RETURN count(n)").result_set[0][0]
        edges = g.ro_query("MATCH ()-[e]->() RETURN count(e)").result_set[0][0]
        print(f"{name:<16} {nodes:>4} nodes {edges:>4} edges")
    print(f"seeded {len(graphs)} template graphs from {scenario['id']}")


if __name__ == "__main__":
    main()
