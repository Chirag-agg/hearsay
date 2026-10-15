"""Check the gossip engine is deterministic: the same seed must give the same village.

    python scripts/check_engine.py

1. Dumps all 13 tpl_* graphs, runs scripts/seed.py's build + pre-game ticks again, dumps
   again, and compares: every node, property and edge must match exactly.
2. Copies the templates into two games, runs 2 more ticks (two interrogations' worth) on
   each, and compares the two games graph by graph. Deletes both games afterwards.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db  # noqa: E402
from app.engine import gossip  # noqa: E402
from app.scenario import load_scenario  # noqa: E402
from app.scenario.loader import build_templates  # noqa: E402


def dump(graph: str) -> tuple[list[str], list[str]]:
    """Every node and edge as sorted JSON strings, keyed by properties (internal ids may differ)."""
    def ro(cypher):
        return db.run_cypher(graph, cypher, label="engine check dump", readonly=True)

    def key(labels, props):
        return json.dumps([sorted(labels), props], sort_keys=True)

    nodes = sorted(key(r["l"], r["p"]) for r in ro("MATCH (n) RETURN labels(n) AS l, properties(n) AS p"))
    edges = sorted(json.dumps([r["t"], key(r["al"], r["ap"]), key(r["bl"], r["bp"]), r["p"]], sort_keys=True)
                   for r in ro("MATCH (a)-[e]->(b) RETURN type(e) AS t, labels(a) AS al, properties(a) AS ap, "
                               "labels(b) AS bl, properties(b) AS bp, properties(e) AS p"))
    return nodes, edges


def compare(a: db.Graphs, b: db.Graphs) -> list[str]:
    diffs = []
    for ga, gb in zip(a.all(), b.all()):
        da, dbb = dump(ga), dump(gb)
        if da != dbb:
            only_a = len(set(da[0]) - set(dbb[0])) + len(set(da[1]) - set(dbb[1]))
            only_b = len(set(dbb[0]) - set(da[0])) + len(set(dbb[1]) - set(da[1]))
            diffs.append(f"{ga} vs {gb}: {only_a} items only in the first, {only_b} only in the second")
    return diffs


def snapshot(graphs: db.Graphs) -> dict[str, tuple]:
    return {g: dump(g) for g in graphs.all()}


def main() -> None:
    scenario = load_scenario()
    seed = int(os.getenv("GAME_SEED", "42"))
    ticks = scenario["clock"]["pregame_ticks"]
    failures = 0

    first = snapshot(db.TEMPLATES)
    build_templates(scenario, seed)
    gossip.run_ticks(db.TEMPLATES, ticks)
    second = snapshot(db.TEMPLATES)
    diffs = [g for g in first if first[g] != second[g]]
    total = sum(len(n) + len(e) for n, e in second.values())
    if diffs:
        failures += 1
        print(f"WRONG reseeding changed {diffs}")
    else:
        print(f"ok    reseeding with seed {seed} rebuilds all 13 templates identically ({total} nodes and edges)")

    games = [db.game("enginecheck_a"), db.game("enginecheck_b")]
    try:
        for g in games:
            for name in g.all():
                if name in db.list_graphs():
                    db.delete_graph(name)
            db.new_game(g.prefix.removeprefix("game_"))
            hops = gossip.run_ticks(g, 2)
            print(f"      {g.prefix}: 2 more ticks, {len(hops)} hops")
        diffs = compare(*games)
        if diffs:
            failures += 1
            print("WRONG two games from the same templates diverged:\n  " + "\n  ".join(diffs))
        else:
            print("ok    two games given the same 2 extra ticks match exactly")
    finally:
        for g in games:
            for name in g.all():
                if name in db.list_graphs():
                    db.delete_graph(name)

    print("engine is deterministic" if not failures else f"{failures} failing")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
