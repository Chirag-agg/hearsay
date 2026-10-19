"""FalkorDB client, graph names, and the one function every query goes through.

One instance holds 13 graphs per game: world (hidden truth), village (public), one per
villager, and the player's case graph. The tpl_* templates are copied into each game.

Every query runs through `run` (a .cypher file by name) or `run_cypher` (inline Cypher
with a label). Both log the graph, query and milliseconds, keep the last few hundred
calls for the live query monitor, and run `q*` files read-only: those are the ones the
villager agents and the detective call, so they can never write.
"""

import logging
import os
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass
from functools import cache

from dotenv import load_dotenv
from falkordb import FalkorDB

from app import queries

load_dotenv()  # finds the repo-root .env; real environment variables still win

log = logging.getLogger("hearsay.query")

VILLAGERS = ["elena", "jonas", "wren", "bess", "pip", "aldric", "tilly", "hale", "brann", "imogen"]
VICTIM = "silas"


def endpoint() -> tuple[str, int]:
    """FALKORDB_HOST and FALKORDB_PORT. FalkorDB Cloud shows the address as host:port, and that is
    often pasted whole into FALKORDB_HOST: a port there wins over FALKORDB_PORT."""
    host = os.getenv("FALKORDB_HOST", "localhost").strip()
    port = os.getenv("FALKORDB_PORT", "6379").strip()
    if host.count(":") == 1:
        host, port = host.split(":")
    return host, int(port)


def connect() -> FalkorDB:
    """A new client. Most code should use `client()`, which shares one connection pool."""
    host, port = endpoint()
    return FalkorDB(
        host=host,
        port=port,
        username=os.getenv("FALKORDB_USERNAME") or None,  # FalkorDB Cloud needs one; local Docker doesn't
        password=os.getenv("FALKORDB_PASSWORD") or None,
    )


@cache
def client() -> FalkorDB:
    return connect()


# ---------------------------------------------------------------- graph names

@dataclass(frozen=True)
class Graphs:
    """The 13 graph names behind one prefix: "tpl" for the templates, "game_<g>" for a game."""

    prefix: str

    @property
    def world(self) -> str:
        return f"{self.prefix}_world"

    @property
    def village(self) -> str:
        return f"{self.prefix}_village"

    @property
    def case(self) -> str:
        return f"{self.prefix}_case"

    def npc(self, villager_id: str) -> str:
        return f"{self.prefix}_npc_{villager_id}"

    def all(self) -> list[str]:
        return [self.world, self.village, self.case, *(self.npc(v) for v in VILLAGERS)]


TEMPLATES = Graphs("tpl")


def game(g: str) -> Graphs:
    return Graphs(f"game_{g}")


def world(g: str) -> str:
    return game(g).world


def village(g: str) -> str:
    return game(g).village


def npc(g: str, villager_id: str) -> str:
    return game(g).npc(villager_id)


def case(g: str) -> str:
    return game(g).case


def game_graphs(g: str) -> list[str]:
    return game(g).all()


def template_graphs() -> dict[str, str]:
    """Map each template graph to the suffix it gets in a game: tpl_world -> world, ..."""
    return {name: name.removeprefix("tpl_") for name in TEMPLATES.all()}


# ---------------------------------------------------------------- running queries

RECENT: deque[dict] = deque(maxlen=500)  # the live query monitor reads this
STATS: Counter = Counter()  # calls per query name
STATS_MS: Counter = Counter()  # total milliseconds per query name
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def graph_lock(graph: str) -> threading.Lock:
    """One lock per graph, so a gossip write and an interrogation write to the same villager stay in order."""
    with _locks_guard:
        return _locks.setdefault(graph, threading.Lock())


def _rows(result) -> list[dict]:
    cols = [c[1] if isinstance(c, (list, tuple)) else c for c in result.header]
    cols = [c.decode() if isinstance(c, bytes) else c for c in cols]
    return [dict(zip(cols, row)) for row in result.result_set]


def _record(graph: str, name: str, ms: float, rows: int, readonly: bool, error: str | None = None) -> None:
    entry = {"at": time.time(), "graph": graph, "query": name, "ms": round(ms, 1),
             "rows": rows, "readonly": readonly, "error": error}
    RECENT.append(entry)
    STATS[name] += 1
    STATS_MS[name] += ms
    if error:
        log.warning("%s %s failed after %.1f ms: %s", graph, name, ms, error)
    else:
        log.info("%s %s %.1f ms %d rows%s", graph, name, ms, rows, " (ro)" if readonly else "")


def run_cypher(graph: str, cypher: str, params: dict | None = None, *, label: str,
               readonly: bool = False) -> list[dict]:
    """Run inline Cypher (loaders and the engine's bulk writes). `label` names it in the log."""
    g = client().select_graph(graph)
    start = time.perf_counter()
    try:
        result = g.ro_query(cypher, params) if readonly else g.query(cypher, params)
    except Exception as exc:
        _record(graph, label, (time.perf_counter() - start) * 1000, 0, readonly, str(exc))
        raise
    rows = _rows(result)
    _record(graph, label, (time.perf_counter() - start) * 1000, len(rows), readonly)
    return rows


def run(graph: str, name: str, params: dict | None = None, *, readonly: bool | None = None) -> list[dict]:
    """Run backend/app/queries/<name>.cypher on `graph`. q* files are read-only unless told otherwise."""
    if readonly is None:
        readonly = name.startswith("q")
    return run_cypher(graph, queries.load(name), params, label=name, readonly=readonly)


def run_statements(graph: str, name: str) -> None:
    """Run a multi-statement file (indexes.cypher), one statement at a time."""
    for i, stmt in enumerate(queries.load_statements(name), 1):
        run_cypher(graph, stmt, label=f"{name}#{i}")


def create_nodes(graph: str, label: str, rows: list[dict]) -> None:
    if rows:
        run_cypher(graph, f"UNWIND $rows AS r CREATE (n:{label}) SET n = r", {"rows": rows},
                   label=f"create {label}")


def create_edges(graph: str, rel: str, src: str, dst: str, rows: list[tuple[str, str, dict]]) -> None:
    """Create (src {id: a})-[:rel props]->(dst {id: b}) per row; every endpoint must exist."""
    if not rows:
        return
    params = {"rows": [{"a": a, "b": b, "p": p} for a, b, p in rows]}
    created = run_cypher(
        graph,
        f"UNWIND $rows AS r MATCH (a:{src} {{id: r.a}}), (b:{dst} {{id: r.b}}) "
        f"CREATE (a)-[e:{rel}]->(b) SET e = r.p RETURN count(e) AS n",
        params, label=f"create {rel}",
    )[0]["n"]
    if created != len(rows):
        raise RuntimeError(f"{graph}: {rel} {src}->{dst} created {created} of {len(rows)} edges")


def list_graphs() -> list[str]:
    return client().list_graphs()


def delete_graph(graph: str) -> None:
    start = time.perf_counter()
    client().select_graph(graph).delete()
    _record(graph, "GRAPH.DELETE", (time.perf_counter() - start) * 1000, 0, False)


def copy_graph(src: str, dst: str) -> None:
    start = time.perf_counter()
    client().select_graph(src).copy(dst)
    _record(dst, "GRAPH.COPY", (time.perf_counter() - start) * 1000, 0, False)


def query_stats() -> list[dict]:
    """Calls, total and mean ms, and the FalkorDB features each query uses: the "features used" table."""
    out = []
    for name, calls in STATS.most_common():
        base = name.split("#")[0]
        out.append({"query": name, "calls": calls, "total_ms": round(STATS_MS[name], 1),
                    "mean_ms": round(STATS_MS[name] / calls, 1),
                    "features": queries.features(base) if base in queries.names() else []})
    return out


# ---------------------------------------------------------------- games

def new_game(db_or_g, g: str | None = None) -> Graphs:
    """Copy every template graph into this game's graphs (GRAPH.COPY keeps indexes).

    Accepts new_game(g) or the older new_game(client, g)."""
    g = db_or_g if g is None else g
    target = game(g)
    for tpl in TEMPLATES.all():
        copy_graph(tpl, tpl.replace(TEMPLATES.prefix, target.prefix, 1))
    return target
