"""Per-game event log for the WebSocket: contradiction_found, rumor_spread, clock_tick, mood_changed.

Interrogations run in FastAPI's thread pool, so events go into a thread-safe log per game;
each WebSocket reads from its own position (seq) in the log. Nothing here is persisted: the
graphs are the record, events only drive the live UI.
"""

import threading
import time
from collections import defaultdict, deque

MAX_EVENTS = 1000
_log: dict[str, deque] = defaultdict(lambda: deque(maxlen=MAX_EVENTS))
_next: dict[str, int] = defaultdict(int)
_lock = threading.Lock()


def publish(g: str, events: list[dict]) -> list[dict]:
    out = []
    with _lock:
        for e in events:
            event = {"seq": _next[g], "at": time.time(), **e}
            _next[g] += 1
            _log[g].append(event)
            out.append(event)
    return out


def since(g: str, seq: int) -> list[dict]:
    with _lock:
        return [e for e in _log.get(g, ()) if e["seq"] >= seq]
