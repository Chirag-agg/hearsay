"""The detective's tools: plain functions that the hearsay-graph MCP server exposes.

Every tool reaches only the village and case graphs (never the truth graph, except accuse,
which the engine scores), returns the Cypher it ran so the UI can show it, and never returns
root_id: the detective has to trace rumors by asking, just like the player.
"""

import re
from typing import Any

from app import db, games, play, queries
from app.case import checks, verdict


def _cypher(*names: str) -> list[dict]:
    return [{"query": n, "cypher": queries.load(n)} for n in names]


def _minutes(t) -> int:
    """'21:30' -> 1290; numbers pass through."""
    if isinstance(t, (int, float)):
        return int(t)
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", str(t))
    if not m:
        raise play.BadRequest(f"time {t!r} should look like 21:30")
    h, mins = int(m.group(1)), int(m.group(2))
    return (h + 24 if h < 8 else h) * 60 + mins  # before 08:00 means the morning after


def village_overview(game_id: str) -> dict[str, Any]:
    """People (id, name, role, sex, adult), places, walking times and who knows whom."""
    v = games.village(game_id)
    return {"people": v["people"], "places": v["places"], "roads": v["roads"], "knows": v["knows"],
            "facts": v["facts"], "cypher": []}


def gossip_hubs(game_id: str, top_k: int = 3) -> dict[str, Any]:
    """Villagers ranked by PageRank over KNOWS: who hears the most gossip. Ask them first."""
    games.touch(game_id)
    rows = db.run(db.game(game_id).village, "q04_gossip_hubs")
    return {"hubs": rows[:top_k], "cypher": _cypher("q04_gossip_hubs")}


def factions(game_id: str) -> dict[str, Any]:
    """Social circles by label propagation (CDLP), computed once per game."""
    return {"circles": games.circles(game_id), "cypher": _cypher("q05_circles")}


def interrogate(game_id: str, villager_id: str, question: str, about_claim_id: str | None = None,
                cite_statement_ids: list[str] | None = None) -> dict[str, Any]:
    """Ask a villager a question (costs 30 in-game minutes). about_claim_id asks the villager who
    passed a rumor on for their own version of it; cite_statement_ids shows them earlier statements."""
    a = play.ask(game_id, villager_id, question, about_claim_id=about_claim_id,
                 cite_statement_ids=cite_statement_ids or [])
    used = ["q01d_recall_rumor"] if about_claim_id else ["q01_recall", "q01b_recall_place"]
    return {"statement_id": a["statement_id"], "villager": villager_id, "dialogue": a["dialogue"],
            "claims": [{k: c[k] for k in ("claim_id", "label", "pred", "about", "place", "reported_as", "can_ask_source")}
                       for c in a["claims"]],
            "new_contradictions": [c["detail"] for c in a["contradictions_new"]],
            "questions_left": a["status"]["questions_left"],
            "cypher": _cypher(*used, "q01c_claim_details", "q06a_two_places", "q06b_stayed_but_left",
                              "q11_changed_story", "w01_merge_contradiction")}


def who_told_you(game_id: str, claim_id: str) -> dict[str, Any]:
    """For a claim reported as heard: who the villager heard it from (free; asking them costs a question)."""
    return {**play.source(game_id, claim_id), "cypher": _cypher("q03_who_told_me")}


def trace_rumor(game_id: str, claim_id: str) -> dict[str, Any]:
    """Follow a claim back to its origin; shows what changed at each hop and who to ask next."""
    return {**play.trace(game_id, claim_id), "cypher": _cypher("q07_trace_rumor")}


def find_contradictions(game_id: str) -> dict[str, Any]:
    """Alibi clashes and changed stories so far, with who each one implicates."""
    found = play.contradictions(game_id)
    return {"contradictions": found["contradictions"],
            "cypher": _cypher("q06a_two_places", "q06b_stayed_but_left", "q11_changed_story", "q08a_backing")}


def uncorroborated_leads(game_id: str) -> dict[str, Any]:
    """Eyewitness claims nobody else backs up: leads worth checking, not proof of lying."""
    games.touch(game_id)
    return {"leads": db.run(db.game(game_id).case, "q08b_leads"), "cypher": _cypher("q08b_leads")}


def check_travel(game_id: str, person_id: str, from_place: str, from_time: str, to_place: str, to_time: str) -> dict[str, Any]:
    """Could this person walk from one place to another in time? Weighted shortest path over the map."""
    games.touch(game_id)
    rows = db.run(db.game(game_id).case, "q10_travel", {"from_place": from_place, "to_place": to_place,
                                                         "from_t": _minutes(from_time), "to_t": _minutes(to_time)})
    return {"person": person_id, "result": rows[0] if rows else None, "cypher": _cypher("q10_travel")}


def suspects_fitting(game_id: str, description_id: str) -> dict[str, Any]:
    """Who matches a sighting description (e.g. d_woman_lantern) and has no confirmed alibi at the time of death."""
    games.touch(game_id)
    rows = checks.suspects_fitting(db.game(game_id).case, description_id)
    return {"suspects": rows, "cypher": _cypher("q13_alibi", "q12_suspects_fitting")}


def alibi_independence(game_id: str, person_id: str, time: str = "21:30") -> dict[str, Any]:
    """Are a person's alibi confirmations from independent eyewitnesses? Nothing is stored."""
    games.touch(game_id)
    rows = checks.alibi(db.game(game_id).case, person_id, _minutes(time))
    return {"person": person_id, "time": time, "places": rows, "cypher": _cypher("q13_alibi")}


def score_suspects(game_id: str) -> dict[str, Any]:
    """Motive, means, lies, fit to the scene sighting and alibi for every suspect."""
    s = play.suspects(game_id)
    return {**s, "cypher": _cypher("q07_trace_rumor", "q14_rank_suspects")}


def case_summary(game_id: str) -> dict[str, Any]:
    """Statements on the board so far (id, villager, what they said), the clock, and what the board holds."""
    status = games.status(game_id)
    rows = db.run_cypher(db.game(game_id).case, """
        MATCH (s:Statement) RETURN s.id AS statement_id, s.villager AS villager, s.question AS question,
               s.text AS said, s.tick AS tick ORDER BY tick""", label="detective case summary", readonly=True)
    return {"status": status, "statements": rows, "cypher": []}


def accuse(game_id: str, suspect_id: str, motive: str, statement_ids: list[str]) -> dict[str, Any]:
    """The final action: name the suspect, the motive and the statements that prove it."""
    return {**verdict.accuse(game_id, suspect_id, motive, statement_ids), "cypher": []}


TOOLS = [village_overview, gossip_hubs, factions, interrogate, who_told_you, trace_rumor, find_contradictions,
         uncorroborated_leads, check_travel, suspects_fitting, alibi_independence, score_suspects, case_summary, accuse]
