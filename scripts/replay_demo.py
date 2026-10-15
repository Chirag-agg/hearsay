"""Play the intended solving path end to end with REPLAY=1. If it passes, the demo works.

    python scripts/replay_demo.py            # creates a game, plays it, deletes it
    python scripts/replay_demo.py --keep     # keeps the game (for recording or the UI)

The order follows the demo script: the off-camera questions first (Bess, Hale, Imogen,
Tilly, Father Aldric, Elena, Jonas, Lady Wren citing Bess's "left toward the Manor"), the
ranking with the sighting as "a man" (Jonas 12, Elena 9), then "who told you?" from Bess
back through Brann and Hale to Pip, the flip (Elena 12, Jonas 9), the accusation and reveal,
and a second session in which Elena remembers being called a liar. Run before every deploy.
"""

import argparse
import os
import sys
from pathlib import Path

os.environ["REPLAY"] = "1"
os.environ.setdefault("KILLER_REACTS", "0")  # the core solving path; check_killer.py covers the stretch rules
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import db, games, play  # noqa: E402
from app.case import checks, verdict  # noqa: E402

failures = 0


def check(label: str, ok: bool, got=None) -> None:
    global failures
    print(f"{'ok   ' if ok else 'WRONG'} {label}" + ("" if ok else f": {got}"))
    failures += not ok


def say(answer: dict) -> None:
    print(f"\n  {answer['name']}: {answer['dialogue']}")
    for e in answer["contradictions_new"]:
        print(f"  ! contradiction: {e['detail']}")


def scores(g: str) -> dict[str, int]:
    return {r["suspect_id"]: r["score"] for r in play.suspects(g)["ranking"]}


def chip(answer: dict, about: str) -> dict:
    return next(c for c in answer["claims"] if c["about"] == about)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", action="store_true", help="keep the game afterwards")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    g = games.create_game()["game_id"]
    print(f"game {g}")
    try:
        play_game(g)
    finally:
        if not args.keep:
            games.delete_game(g)
        else:
            print(f"\nkept game {g}")
    print("\nreplay passed" if not failures else f"\n{failures} failing")
    sys.exit(1 if failures else 0)


def play_game(g: str) -> None:
    def ask(vid: str, q: str, **kw) -> dict:
        a = play.ask(g, vid, q, **kw)
        print(f"\n> {vid}: {q}")
        say(a)
        check(f"{vid}: guardrail passes", a["guardrail_ok"], a)
        return a

    village = games.village(g)
    check("PageRank points to Bess", village["gossip_hubs"][0]["id"] == "bess", village["gossip_hubs"])

    print("\n--- off camera ---")
    bess_tavern = ask("bess", "Who was at the tavern last night?")
    bess_mill = ask("bess", "Did you see anyone near the mill?")
    ask("hale", "Who was at the tavern last night?")
    ask("imogen", "Who was at the tavern last night?")
    tilly = ask("tilly", "Did you see Elena or Jonas at the smithy, and did Silas threaten anyone?")
    aldric = ask("aldric", "When did Elena leave the chapel?")
    elena = ask("elena", "Where were you between 21:00 and 22:00?")
    jonas = ask("jonas", "Where were you between 21:00 and 22:00?")
    wren = ask("wren", "Was Jonas with you last night?", cite_statement_ids=[bess_tavern["statement_id"]])

    check("Bess saw Jonas leave the Tavern toward the Manor",
          any(c["pred"] == "LEFT" and c["about"] == "Jonas Reed" for c in bess_tavern["claims"]), bess_tavern["claims"])
    check("Bess repeats a man near the Mill",
          any(c["about"] == "a man with a lantern" for c in bess_mill["claims"]), bess_mill["claims"])
    check("Lady Wren confirms Jonas once Bess's statement is cited",
          any(c["about"] == "Jonas Reed" and c["pred"] == "WAS_AT" for c in wren["claims"]), wren["dialogue"])

    found = play.contradictions(g)
    implicated = {(c["kind"], c["implicates"]) for c in found["contradictions"]}
    check("Q6b: Elena stayed until 22:00, Aldric saw her leave at 21:00 -> implicates Elena",
          ("stayed_but_left", "elena") in implicated, found["contradictions"])
    check("Q6a: Jonas at the Smithy, Lady Wren says the Manor -> implicates Jonas",
          ("two_places", "jonas") in implicated, found["contradictions"])
    check("Father Aldric is never implicated", not any(p == "aldric" for _, p in implicated), implicated)

    travel = db.run(db.game(g).case, "q10_travel", {"from_place": "chapel", "to_place": "mill", "from_t": 1260, "to_t": 1290})
    check("Q10: Chapel to Mill takes 20 minutes, she had 30", travel[0]["minutes_needed"] == 20 and travel[0]["possible"], travel)

    held = play.suspects(g)
    s = scores(g)
    print(f"\n  sighting held: {held['sighting_text']}; ranking: {[(r['suspect'], r['score']) for r in held['ranking'][:4]]}")
    check("with 'a man', Jonas leads 12 to 9", held["sighting"] == "d_man_lantern" and s["jonas"] == 12 and s["elena"] == 9,
          held["ranking"][:4])

    print("\n--- the trace: who told you? ---")
    sighting = chip(bess_mill, "a man with a lantern")
    hop = play.source(g, sighting["claim_id"])
    check("Bess heard it from Brann", hop["source"] == "brann", hop)
    brann = ask("brann", "Who told you about the man near the mill?", about_claim_id=sighting["claim_id"])
    hop = play.source(g, brann["claims"][0]["claim_id"])
    check("Brann heard it from Hale", hop["source"] == "hale", hop)
    hale = ask("hale", "Who told you about that man?", about_claim_id=brann["claims"][0]["claim_id"])
    hop = play.source(g, hale["claims"][0]["claim_id"])
    check("Hale heard it from Pip", hop["source"] == "pip", hop)
    pip = ask("pip", "What exactly did you see?", about_claim_id=hale["claims"][0]["claim_id"])
    check("Pip saw it himself: a woman with a lantern", pip["claims"][0]["reported_as"] == "saw"
          and pip["claims"][0]["about"] == "a woman with a lantern", pip["claims"])

    chain = play.trace(g, sighting["claim_id"])
    print("\n  trace: " + "  ->  ".join(f"{h['teller_name']}: {h['about']}, {h['place']}, {h['time']}"
                                       + (f" [{', '.join(h['changed'])} changed]" if h["changed"] else "")
                                       for h in chain["chain"]))
    check("Q7: Bess -> Brann -> Hale -> Pip, reaching the eyewitness",
          [h["teller"] for h in chain["chain"]] == ["bess", "brann", "hale", "pip"] and chain["reached_eyewitness"], chain)
    check("the trace shows 22:00 was 21:30, the Mill was the Riverside path, the man was a woman",
          (chain["chain"][0]["time"], chain["chain"][0]["place"], chain["chain"][-1]["time"], chain["chain"][-1]["place"],
           chain["chain"][-1]["about"]) == ("22:00", "Old Mill", "21:30", "Riverside path", "a woman with a lantern"), chain)

    held = play.suspects(g)
    s = scores(g)
    print(f"\n  sighting held: {held['sighting_text']}; ranking: {[(r['suspect'], r['score']) for r in held['ranking'][:4]]}")
    check("with Pip's 'woman with a lantern', Elena leads 12 to 9",
          held["sighting"] == "d_woman_lantern" and s["elena"] == 12 and s["jonas"] == 9, held["ranking"][:4])

    fitting = checks.suspects_fitting(db.game(g).case, "d_woman_lantern")
    check("Q12: adult women without a confirmed alibi are Elena and Lady Wren",
          sorted(r["suspect_id"] for r in fitting) == ["elena", "wren"], fitting)
    alibis = checks.recompute_alibis(db.game(g).case)
    check("Q13: Bess's and Imogen's alibis are confirmed by independent eyewitnesses",
          alibis.get("bess") and alibis.get("imogen"), alibis)

    print("\n--- accusation ---")
    ask("elena", "You're lying. Father Aldric saw you leave the chapel at nine.")
    status = games.status(g)
    check(f"{status['questions_asked']} questions used, {status['questions_left']} left", status["questions_left"] >= 0, status)
    v = verdict.accuse(g, "elena", "She owed Silas 300 crowns and he threatened to take her shop",
                       [tilly["statement_id"], aldric["statement_id"], elena["statement_id"], pip["statement_id"]])
    print(f"\n  verdict: {v['summary']} score {v['score']}; evidence {[k for k, x in v['evidence'].items() if x]}")
    check("the accusation is right, with motive, means, opportunity and a lie on record",
          v["correct"] and v["motive_correct"] and all(v["evidence"].values()), v)
    shown = verdict.reveal(g)
    print("  reveal: " + " | ".join(f"{h['from']} -> {h['to']}: {h['changed']} {h['before']} -> {h['after']}"
                                   for h in shown["sighting_rumor"][:3]))
    check("the reveal shows the killer and the sighting's hops", shown["truth"]["killer"] == "Elena Marsh"
          and len(shown["sighting_rumor"]) >= 3, shown["truth"])

    print("\n--- second session ---")
    games.new_session(g)
    again = ask("elena", "Where were you last night?")
    check("Elena remembers: 'You again. Last time you called me a liar.'",
          again["dialogue"].startswith("You again. Last time you called me a liar."), again["dialogue"])


if __name__ == "__main__":
    main()
