"""Check the killer reacts (stretch): questions become gossip that switches Elena's rules on.

    python scripts/check_killer.py

1. Ask Bess about the hammer; gossip until Elena hears; her frame-up rule switches on and she
   says she saw Jonas carry his hammer toward the Mill at 20:45. Two Tavern witnesses put Jonas
   in the Tavern then, so Q6a implicates Elena, not Jonas.
2. Ask Elena where she was, then ask Father Aldric when she left the Chapel; once that reaches
   her she switches to "I left at 21:00 and went home", and Q11 implicates her for the change.
"""

import os
import sys
from pathlib import Path

os.environ["REPLAY"] = "1"
os.environ["KILLER_REACTS"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db, games, play  # noqa: E402
from app.engine import gossip, reactions  # noqa: E402

failures = 0


def check(label: str, ok: bool, got=None) -> None:
    global failures
    print(f"{'ok   ' if ok else 'WRONG'} {label}" + ("" if ok else f": {got}"))
    failures += not ok


def gossip_until(graphs: db.Graphs, rule: str, max_ticks: int = 10) -> int:
    for n in range(1, max_ticks + 1):
        gossip.run_ticks(graphs, 1)
        if any(f["rule"] == rule for f in reactions.react(graphs)):
            return n
    return 0


def rule_active(graphs: db.Graphs, rule: str) -> bool:
    rows = db.run_cypher(graphs.npc("elena"), "MATCH (r:Rule {id: $id}) RETURN r.active AS a", {"id": rule},
                         label="check rule", readonly=True)
    return bool(rows and rows[0]["a"])


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    g = games.create_game()["game_id"]
    graphs = db.game(g)
    try:
        play.ask(g, "bess", "Did anyone take the blacksmith's hammer?")
        ticks = 1 if rule_active(graphs, "rule_elena_frame_jonas") else gossip_until(graphs, "rule_elena_frame_jonas")
        check(f"word of the hammer question reaches Elena ({ticks} more ticks) and her frame-up switches on",
              rule_active(graphs, "rule_elena_frame_jonas"))
        elena = play.ask(g, "elena", "Did you see Jonas last night?")
        print(f"  Elena: {elena['dialogue']}")
        check("Elena now says Jonas carried his hammer toward the Mill at 20:45",
              any(c["place"] == "Old Mill" and c["about"] == "Jonas Reed" for c in elena["claims"]), elena["claims"])
        play.ask(g, "imogen", "Who was at the tavern last night?")
        play.ask(g, "bess", "Was Jonas at the tavern last night?")
        found = play.contradictions(g)["contradictions"]
        planted = [c for c in found if c["kind"] == "two_places" and "Old Mill" in c["detail"]]
        check("Q6a catches the planted lie and implicates Elena, not Jonas",
              planted and all(c["implicates"] == "elena" for c in planted), found)

        play.ask(g, "elena", "Where were you between 21:00 and 22:00?")
        play.ask(g, "aldric", "When did Elena leave the chapel?")
        ticks = gossip_until(graphs, "rule_elena_change_story")
        check(f"word that Aldric was asked reaches Elena ({ticks} ticks) and she changes her story",
              rule_active(graphs, "rule_elena_change_story") and not rule_active(graphs, "rule_elena_cover"))
        again = play.ask(g, "elena", "Where were you between 21:00 and 22:00?")
        print(f"  Elena: {again['dialogue']}")
        changed = [c for c in play.contradictions(g)["contradictions"] if c["kind"] == "changed_story"]
        check("Q11 catches the changed story and implicates Elena", changed and changed[0]["implicates"] == "elena", changed)
        lies = next(r["lies"] for r in play.suspects(g)["ranking"] if r["suspect_id"] == "elena")
        check("the changed story is not a second lie: the abandoned Chapel story is already counted", lies == 2, lies)
    finally:
        games.delete_game(g)
    print("killer checks passed" if not failures else f"{failures} failing")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
