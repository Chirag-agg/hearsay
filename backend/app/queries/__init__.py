"""Cypher queries, one per .cypher file so the README can list them directly.

Full-line `//` comments are stripped before a query is sent, so the files can
carry their header (graph, params) without depending on FalkorDB's comment support.
"""

from functools import cache
from pathlib import Path

QUERY_DIR = Path(__file__).parent


def _strip_comments(text: str) -> str:
    lines = [line for line in text.splitlines() if not line.lstrip().startswith("//")]
    return "\n".join(lines).strip()


@cache
def load(name: str) -> str:
    """Return the query in `<name>.cypher`, e.g. load("q10_travel")."""
    return _strip_comments((QUERY_DIR / f"{name}.cypher").read_text(encoding="utf-8"))


def load_statements(name: str) -> list[str]:
    """Split a multi-statement file (indexes.cypher) on semicolons."""
    return [stmt.strip() for stmt in load(name).split(";") if stmt.strip()]


@cache
def names() -> list[str]:
    return sorted(path.stem for path in QUERY_DIR.glob("*.cypher"))


# FalkorDB features a query leans on, found from its text: the README's "features used" table.
FEATURES = {
    "algo.pageRank": "PageRank",
    "algo.labelPropagation": "Label propagation (CDLP)",
    "algo.SPpaths": "Weighted shortest paths",
    "*0..": "Variable-length paths (zero-length included)",
    "MERGE": "MERGE upsert",
    "CREATE INDEX": "Indexes",
    "collect(": "Aggregation",
    "OPTIONAL MATCH": "Optional match",
}


@cache
def features(name: str) -> list[str]:
    text = load(name)
    return [label for needle, label in FEATURES.items() if needle in text]
