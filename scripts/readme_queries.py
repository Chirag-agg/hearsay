"""Regenerate the README's "Cypher queries" section from backend/app/queries/*.cypher.

    python scripts/readme_queries.py

Each query is listed with its header comment and its full Cypher, so the README always shows
exactly what the code runs.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
QUERIES = ROOT / "backend" / "app" / "queries"
START, END = "<!-- queries:start -->", "<!-- queries:end -->"


def section() -> str:
    parts = []
    for path in sorted(QUERIES.glob("*.cypher")):
        lines = path.read_text(encoding="utf-8").splitlines()
        comments = [re.sub(r"^\s*//\s?", "", line) for line in lines if line.lstrip().startswith("//")]
        body = "\n".join(line for line in lines if not line.lstrip().startswith("//")).strip()
        title = comments[0] if comments else path.stem
        notes = " ".join(c for c in comments[1:] if c)
        parts.append(f"### `{path.stem}`\n\n**{title}**" + (f" {notes}" if notes else "") + f"\n\n```cypher\n{body}\n```\n")
    return "\n".join(parts)


def main() -> None:
    text = README.read_text(encoding="utf-8")
    a, b = text.index(START) + len(START), text.index(END)
    README.write_text(text[:a] + "\n\n" + section() + "\n" + text[b:], encoding="utf-8")
    print(f"README: {len(list(QUERIES.glob('*.cypher')))} queries")


if __name__ == "__main__":
    main()
