"""The LLM renderer: puts graph facts into words, nothing more.

It gets a persona card, the claims as JSON with their ids, and episodic memory, and must
return {dialogue, claim_ids_used, emotion}. It never decides facts: the agent's guardrail
checks every person, place and time it writes against the claims it cites, retries once with
a stricter prompt, then falls back to the template answer.

Any OpenAI-compatible chat API works (LLM_PROVIDER=groq by default; LLM_BASE_URL overrides).
"""

import json
import os
import time
import urllib.error
import urllib.request

from app.engine.gossip import hhmm

BASE_URLS = {"groq": "https://api.groq.com/openai/v1", "openai": "https://api.openai.com/v1"}
TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "30"))


def configured() -> bool:
    return bool(os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL") and _base_url())


def _base_url() -> str | None:
    return os.getenv("LLM_BASE_URL") or BASE_URLS.get(os.getenv("LLM_PROVIDER", "").lower())


def _time(c: dict) -> str | None:
    span = c["t_to"] - c["t_from"]
    if span == 10:
        return hhmm(c["t_from"] + 5)
    if span >= 1440:
        return None
    return f"{hhmm(c['t_from'])} to {hhmm(c['t_to'])}"


def fact(c: dict, me: dict) -> dict:
    """One claim as the model sees it. The villager's lie is just "your account"."""
    source = {"witnessed": "you saw it", "lie": "your own account", "heard": f"{c.get('heard_from')} told you"}
    out = {"id": c["claim_id"], "what": c["pred"],
           "who": "you" if c["subject_id"] == me["id"] else c["who"],
           "place": c.get("place"), "object": c.get("object"), "heading_for": c.get("toward"),
           "crowns": c.get("crowns"), "time": _time(c), "source": source.get(c["origin"], c["origin"]),
           "note": c.get("note")}
    if c["origin"] == "heard" and c["confidence"] < 0.4:
        out["certainty"] = "low: you're not sure of it"
    return {k: v for k, v in out.items() if v is not None}


def prompt(me: dict, claims: list[dict], memory: list[dict], question: str, trust: float, strict: bool) -> str:
    remembered = "; ".join(f"session {m['session']}, they asked \"{m['asked']}\"" for m in memory) or "nothing yet"
    facts = "\n".join(json.dumps(fact(c, me)) for c in claims)
    rules = [
        "Answer in character, in one to three short sentences.",
        "Use only the facts below. Do not add any person, place, time or event that is not in them.",
        "Write times exactly as they appear in the facts (24-hour HH:MM). Use people's and places' names as given.",
        "If a fact's source is someone telling you, say who told you.",
        "Never mention the fact ids in the dialogue.",
    ]
    if strict:
        rules.append("Your last answer mentioned something that is not in the facts. Name only people, places "
                     "and times that appear in the facts you cite, and cite every fact you use.")
    return (
        f"PERSONA: {me.get('persona', me['name'])}\n"
        f"MOOD toward this detective: trust {trust:.1f}, warmth {me.get('player_warmth', 0.5):.1f}\n"
        f"YOU REMEMBER: {remembered}\n"
        f"FACTS YOU MAY USE (use only these, cite their ids):\n{facts}\n"
        f"QUESTION: \"{question}\"\n\n"
        + "\n".join(f"- {r}" for r in rules)
        + '\n\nReturn JSON only: {"dialogue": "...", "claim_ids_used": ["..."], "emotion": "..."}'
    )


MAX_RETRY_WAIT_S = float(os.getenv("LLM_MAX_RETRY_WAIT_S", "8"))


def chat(body: dict, *, retries: int = 1, max_wait_s: float = MAX_RETRY_WAIT_S, timeout_s: float = TIMEOUT_S) -> dict:
    """POST a chat completion and return the message. On a rate limit (429) whose Retry-After is
    short enough, wait and retry. Groq's free tier caps tokens per minute, so bursts hit it."""
    req = urllib.request.Request(
        f"{_base_url()}/chat/completions", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}", "Content-Type": "application/json",
                 "User-Agent": "hearsay/0.1"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                return json.load(resp)["choices"][0]["message"]
        except urllib.error.HTTPError as exc:
            wait = float(exc.headers.get("retry-after") or 0) if exc.code == 429 else 0
            if attempt < retries and 0 < wait <= max_wait_s:
                time.sleep(wait)
                continue
            raise RuntimeError(f"LLM HTTP {exc.code}: {exc.read()[:200].decode(errors='replace')}") from None
    raise RuntimeError("LLM retries exhausted")


def render(me: dict, claims: list[dict], memory: list[dict], question: str, trust: float,
           *, strict: bool = False) -> dict:
    body = {
        "model": os.environ["LLM_MODEL"],
        "messages": [
            {"role": "system", "content": "You voice a villager in a murder-mystery game. You only put the "
                                          "given facts into words. You reply with a single JSON object."},
            {"role": "user", "content": prompt(me, claims, memory, question, trust, strict)},
        ],
        "temperature": 0.2 if strict else 0.6,
        "response_format": {"type": "json_object"},
    }
    out = json.loads(chat(body)["content"])
    return {"dialogue": str(out.get("dialogue", "")).strip(),
            "claim_ids_used": [str(x) for x in out.get("claim_ids_used", [])],
            "emotion": str(out.get("emotion", "neutral"))}
