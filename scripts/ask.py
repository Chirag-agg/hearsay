"""Question a villager in the terminal.

    python scripts/ask.py aldric "Was Elena at prayer all evening?"
    python scripts/ask.py aldric                 # interactive; /source <claim_id> asks "who told you?"
    python scripts/ask.py wren "Was Jonas with you?" --cite LEFT:jonas:manor
    python scripts/ask.py aldric "..." --game 1a2b3c4d --show

Reads the tpl_* templates by default (read-only; nothing is written), or a game's graphs with
--game. REPLAY=1 (or no LLM configured) uses the keyword parser and template sentences.
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db  # noqa: E402
from app.npc.agent import Villager  # noqa: E402


def show(answer: dict, verbose: bool) -> None:
    print(f"\n{answer.get('name', answer['villager'])}: {answer['dialogue']}")
    cited = ", ".join(answer.get("claim_ids_used", [])) or "none"
    print(f"   claims: {cited}   mode: {answer.get('mode', 'q3')}   "
          f"guardrail: {'ok' if not answer['guardrail'] else answer['guardrail']}")
    if answer.get("withheld"):
        print(f"   held back by a trust gate: {answer['withheld']}")
    if verbose:
        print("   parsed:", json.dumps(answer.get("parsed")))
        for call in answer.get("queries", []):
            print(f"   query: {call['query']} {json.dumps(call['params'])}")
        for c in answer["claims"]:
            print("   claim:", json.dumps({k: v for k, v in c.items() if v is not None}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("villager", choices=db.VILLAGERS)
    parser.add_argument("question", nargs="?")
    parser.add_argument("--game", help="question a game's graphs instead of the templates")
    parser.add_argument("--trust", type=float, help="override the villager's trust in the player")
    parser.add_argument("--cite", action="append", default=[], help="a cited fact, PRED:subject:toward")
    parser.add_argument("--replay", action="store_true", help="force REPLAY=1 (templates, no LLM)")
    parser.add_argument("--show", action="store_true", help="print the parse, queries and claims")
    args = parser.parse_args()
    if args.replay:
        os.environ["REPLAY"] = "1"

    graphs = db.game(args.game) if args.game else db.TEMPLATES
    villager = Villager(args.villager, graphs)
    cites = [tuple(c.split(":")) for c in args.cite]

    def handle(line: str) -> None:
        if line.startswith("/source "):
            show(villager.who_told(line.split(maxsplit=1)[1].strip()), args.show)
        else:
            show(villager.ask(line, trust=args.trust, cites=cites), args.show)

    if args.question:
        handle(args.question)
        return
    print(f"Questioning {villager.me['name']} ({graphs.prefix}). /source <claim_id> asks who told them; empty line quits.")
    while True:
        try:
            line = input("\nyou> ").strip()
        except EOFError:
            break
        if not line:
            break
        handle(line)


if __name__ == "__main__":
    main()
