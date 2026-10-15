"""Hand a game to the detective agent and watch it work through the hearsay-graph MCP tools.

    python scripts/run_detective.py              # new game, detective solves it, game deleted
    python scripts/run_detective.py --game <id>  # pick up a game the player started
    python scripts/run_detective.py --check      # exit 1 unless the detective accuses the killer

REPLAY=1 (or no LLM configured) runs the scripted detective; otherwise the LLM picks the tools.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import games  # noqa: E402
from app.detective.agent import run_detective  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--game")
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--show-cypher", action="store_true")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    g = args.game or games.create_game()["game_id"]
    try:
        out = run_detective(g, max_steps=args.steps)
    finally:
        if not args.game:
            games.delete_game(g)
    print(f"detective ({out['mode']}) on game {g}:")
    for s in out["steps"]:
        print(f"\n{s['step']:>2}. {s['tool']}({', '.join(f'{k}={v!r}' for k, v in s['args'].items())})")
        if s["why"]:
            print(f"    why: {s['why']}")
        print(f"    -> {s['summary']}")
        if args.show_cypher:
            for c in s["cypher"]:
                print("    cypher " + c["query"] + ":\n      " + c["cypher"].replace("\n", "\n      "))
    print(f"\nreport: {out['report']}")
    if args.check:
        ok = any(s["tool"] == "accuse" and "found the killer" in s["summary"] for s in out["steps"])
        print("detective check passed" if ok else "detective check FAILED")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
