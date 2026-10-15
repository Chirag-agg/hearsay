"""The LLM renderer: puts graph facts into words, nothing more.

Not wired yet: configured() is False until the LLM path lands, so the agent uses templates.
"""


def configured() -> bool:
    return False


def render(me: dict, claims: list[dict], memory: list[dict], question: str, trust: float,
           *, strict: bool = False) -> dict:
    raise NotImplementedError
