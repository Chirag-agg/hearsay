"""FalkorDB client and graph names. One instance holds 13 graphs per game:
world (hidden truth), village (public), one per villager, and the player's case graph."""

import os

from dotenv import load_dotenv
from falkordb import FalkorDB

load_dotenv()  # finds the repo-root .env; real environment variables still win

VILLAGERS = ["elena", "jonas", "wren", "bess", "pip", "aldric", "tilly", "hale", "brann", "imogen"]
VICTIM = "silas"


def connect() -> FalkorDB:
    return FalkorDB(
        host=os.getenv("FALKORDB_HOST", "localhost"),
        port=int(os.getenv("FALKORDB_PORT", "6379")),
        username=os.getenv("FALKORDB_USERNAME") or None,  # FalkorDB Cloud needs one; local Docker doesn't
        password=os.getenv("FALKORDB_PASSWORD") or None,
    )


def world(g: str) -> str:
    return f"game_{g}_world"


def village(g: str) -> str:
    return f"game_{g}_village"


def npc(g: str, villager_id: str) -> str:
    return f"game_{g}_npc_{villager_id}"


def case(g: str) -> str:
    return f"game_{g}_case"


def game_graphs(g: str) -> list[str]:
    return [world(g), village(g), case(g), *(npc(g, v) for v in VILLAGERS)]


def template_graphs() -> dict[str, str]:
    """Map each template graph to the suffix it gets in a game: tpl_world -> world, ..."""
    names = {"tpl_world": "world", "tpl_village": "village", "tpl_case": "case"}
    names.update({f"tpl_npc_{v}": f"npc_{v}" for v in VILLAGERS})
    return names


def new_game(db: FalkorDB, g: str) -> None:
    """Copy every template graph into this game's graphs (GRAPH.COPY keeps indexes)."""
    for tpl, suffix in template_graphs().items():
        db.select_graph(tpl).copy(f"game_{g}_{suffix}")
