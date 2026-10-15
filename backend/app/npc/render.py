"""Turn claims into words, and check the words against the claims.

`template_answer` is the REPLAY=1 renderer (and the LLM's fallback): one sentence per claim,
built only from the claim's own fields, so the same claims always give the same answer.

`guardrail` is the rule that stops hallucinated clues: every person, place and time the
dialogue mentions must come from the claims it cites. It runs on every answer, template or LLM.
"""

import re

from app.engine.gossip import hhmm

PRED_VERBS = {"ARGUED_WITH": "argued with", "THREATENED": "threatened", "SAW": "saw"}


def when(c: dict) -> str:
    if c["t_to"] - c["t_from"] == 10:
        return f"around {hhmm(c['t_from'] + 5)}"
    if c["t_to"] - c["t_from"] >= 1440:
        return ""  # a standing fact ("Silas had a spare key"), not a moment
    return f"from {hhmm(c['t_from'])} to {hhmm(c['t_to'])}"


def _clause(c: dict, self_id: str, pronouns: dict[str, str]) -> str:
    me = c["subject_id"] == self_id
    who = "I" if me else (c["who"] or "someone")
    if not me and c["origin"] == "heard" and c.get("heard_from_id") == c["subject_id"]:
        who = pronouns.get(c["subject_id"], "they")  # "Elena told me she was at the Chapel"
    at = f" at the {c['place']}" if c.get("place") else ""
    t = when(c)
    t = f" {t}" if t else ""
    pred = c["pred"]
    if pred == "ASKED":  # gossip about the investigation itself
        return c.get("note") or "the detective has been asking questions"
    if pred == "WAS_AT":
        carrying = f" with {c['object']}" if c.get("object") else ""
        return f"{who} was{at}{carrying}{t}"
    if pred == "LEFT":
        toward = f", heading for the {c['toward']}" if c.get("toward") else ""
        return f"{who} left the {c['place']}{t}{toward}" if c.get("place") else f"{who} left{t}{toward}"
    if pred == "CARRIED":
        return f"{who} was carrying {c['object'] or 'something'}{at}{t}"
    if pred == "OWES":
        amount = f" {c['crowns']} crowns" if c.get("crowns") else " money"
        return f"{who} {'owe' if me else 'owes'} {c['object']}{amount}"
    verb = PRED_VERBS.get(pred, pred.lower().replace("_", " "))
    return f"{who} {verb} {c['object'] or ''}{at}{t}".replace("  ", " ")


def sentence(c: dict, self_id: str, pronouns: dict[str, str]) -> str:
    clause = _clause(c, self_id, pronouns)
    if c.get("note") and c["pred"] != "ASKED":
        clause += f" ({c['note'].rstrip('.')})"  # "found dead", "time of death, from examining the body"
    if c["origin"] == "heard":
        source = c.get("heard_from") or "someone"
        hedge = "" if c["confidence"] >= 0.4 else ", though I can't swear to it"
        return f"{source} told me {clause}{hedge}."
    return clause[0].upper() + clause[1:] + "."


def template_answer(claims: list[dict], self_id: str, pronouns: dict[str, str] | None = None) -> dict:
    """pronouns: person id -> "he"/"she", for a teller talking about themselves."""
    if not claims:
        return {"dialogue": "I can't tell you anything about that.", "claim_ids_used": [], "emotion": "neutral"}
    return {"dialogue": " ".join(sentence(c, self_id, pronouns or {}) for c in claims),
            "claim_ids_used": [c["claim_id"] for c in claims], "emotion": "neutral"}


# ---------------------------------------------------------------- guardrail

TIME = re.compile(r"\b(\d{1,2}):(\d{2})\b")


def _allowed(claims: list[dict], self_name: str) -> tuple[str, set[str]]:
    """All text the cited claims can vouch for, plus the set of times they cover."""
    text = [self_name]
    times: set[str] = set()
    for c in claims:
        text += [c.get(k) or "" for k in ("who", "place", "object", "toward", "heard_from", "note")]
        for t in (c["t_from"], c["t_to"], c["t_from"] + 5 if c["t_to"] - c["t_from"] == 10 else None):
            if t is not None:
                times.add(hhmm(t))
    return " ".join(text).lower(), times


def guardrail(dialogue: str, claim_ids_used: list[str], claims_by_id: dict[str, dict],
              vocabulary: dict[str, list[str]], self_name: str) -> list[str]:
    """Problems with the dialogue; empty means it passed.

    vocabulary maps each kind ("person", "place") to every name the village knows, including
    first names and surnames, so "Elena" is caught even when the claim says "Elena Marsh"."""
    problems = []
    unknown = [cid for cid in claim_ids_used if cid not in claims_by_id]
    if unknown:
        problems.append(f"cites claims it wasn't given: {unknown}")
    used = [claims_by_id[cid] for cid in claim_ids_used if cid in claims_by_id]
    allowed_text, allowed_times = _allowed(used, self_name)
    lowered = dialogue.lower()
    for kind, names in vocabulary.items():
        for name in names:
            if re.search(rf"\b{re.escape(name.lower())}\b", lowered) and name.lower() not in allowed_text:
                problems.append(f"mentions {kind} {name!r}, which no cited claim mentions")
    for h, m in TIME.findall(dialogue):
        t = f"{int(h):02d}:{m}"
        if t not in allowed_times:
            problems.append(f"mentions time {t}, which no cited claim covers")
    return problems
