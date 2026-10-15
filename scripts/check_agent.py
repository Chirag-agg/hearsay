"""Check the villager agent answers the demo's questions from the right claims (REPLAY=1).

    python scripts/check_agent.py

Runs on the tpl_* templates, read-only. Every answer must pass the guardrail, and the
guardrail itself must reject an answer that invents a place, a time or a claim id.
"""

import os
import sys
from pathlib import Path

os.environ["REPLAY"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.npc.agent import Villager  # noqa: E402
from app.npc.render import guardrail  # noqa: E402

agents: dict[str, Villager] = {}


def ask(vid: str, question: str, **kw) -> dict:
    agent = agents.setdefault(vid, Villager(vid))
    return agent.ask(question, **kw)


def main() -> None:
    failures = 0

    def check(label: str, ok: bool, got) -> None:
        nonlocal failures
        print(f"{'ok   ' if ok else 'WRONG'} {label}" + ("" if ok else f": {got}"))
        failures += not ok

    answers = {
        "aldric": ask("aldric", "When did Elena leave the chapel?"),
        "elena": ask("elena", "Where were you between 21:00 and 22:00?"),
        "jonas": ask("jonas", "Where were you at half past nine?"),
        "wren_closed": ask("wren", "Was Jonas with you last night?"),
        "wren_cited": ask("wren", "Was Jonas with you last night?", cites=[("LEFT", "jonas", "manor")]),
        "wren_trusted": ask("wren", "Was Jonas with you last night?", trust=0.6),
        "bess": ask("bess", "Did you see anyone near the mill?"),
        "bess_jonas": ask("bess", "Where did Jonas go when he left the tavern?"),
        "tilly": ask("tilly", "Does Elena owe Silas money?"),
        "pip": ask("pip", "What did you see on the river path at 21:30?"),
    }
    for name, a in answers.items():
        check(f"{name}: guardrail passes", not a["guardrail"], a["guardrail"])

    used = {k: a["claim_ids_used"] for k, a in answers.items()}
    check("Aldric: Elena left the Chapel at 21:00", "c_aldric_elena_left" in used["aldric"], answers["aldric"]["dialogue"])
    check("Elena: only her cover story", used["elena"] == ["c_elena_lie_chapel"], answers["elena"]["dialogue"])
    check("Jonas: only his cover story", used["jonas"] == ["c_jonas_lie_smithy"], answers["jonas"]["dialogue"])
    check("Wren, gate closed: holds the affair back and says she was alone",
          {"c_wren_jonas_manor"} <= set(answers["wren_closed"]["withheld"])
          and "c_wren_jonas_manor" not in used["wren_closed"]
          and "alone" in answers["wren_closed"]["dialogue"], answers["wren_closed"]["dialogue"])
    check("Wren, citing Bess's LEFT toward the Manor: confirms Jonas", "c_wren_jonas_manor" in used["wren_cited"],
          answers["wren_cited"]["dialogue"])
    check("Wren, trust 0.6: confirms Jonas", "c_wren_jonas_manor" in used["wren_trusted"],
          answers["wren_trusted"]["dialogue"])
    check("Bess: a man near the Mill at 22:00", "c_bess_heard_sighting" in used["bess"], answers["bess"]["dialogue"])
    check("Bess: Jonas left the Tavern toward the Manor", "c_bess_jonas_left" in used["bess_jonas"],
          answers["bess_jonas"]["dialogue"])
    check("Tilly: Elena owes 300 crowns, and the threat", {"c_tilly_elena_owes", "c_tilly_silas_threat"} <= set(used["tilly"]),
          answers["tilly"]["dialogue"])
    check("Pip: a woman with a lantern", "c_pip_saw_woman" in used["pip"], answers["pip"]["dialogue"])

    told = agents["bess"].who_told("c_bess_heard_sighting")
    check("Bess, who told you? Brann", told["dialogue"] == "I heard it from Brann Holt." and not told["guardrail"], told)

    claims = {c["claim_id"]: c for c in answers["aldric"]["claims"]}
    vocab, name = agents["aldric"].vocabulary, agents["aldric"].me["name"]
    invented = guardrail("Elena Marsh left the Chapel around 21:00 and went to the Old Mill at 21:30.",
                         ["c_aldric_elena_left"], claims, vocab, name)
    check("guardrail rejects an invented place and time",
          any("'mill'" in p for p in invented) and any("21:30" in p for p in invented), invented)
    check("guardrail rejects an invented person",
          bool(guardrail("Jonas left the Chapel around 21:00.", ["c_aldric_elena_left"], claims, vocab, name)), None)
    check("guardrail rejects a claim id it wasn't given",
          bool(guardrail("Elena left.", ["c_made_up"], claims, vocab, name)), None)
    check("guardrail accepts first names of cited people",
          not guardrail("Elena left the Chapel around 21:00.", ["c_aldric_elena_left"], claims, vocab, name), None)

    print("agent checks passed" if not failures else f"{failures} failing")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
