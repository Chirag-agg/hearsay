"""FastAPI entry point. Routes from the architecture doc are added as each layer lands:

POST /games, GET /games/{g}, GET /games/{g}/village            <- here now
POST /games/{g}/ask, POST /games/{g}/claims/{claim_id}/source, GET /games/{g}/case,
GET /games/{g}/contradictions, GET /games/{g}/trace/{claim_id},
POST /games/{g}/detective, POST /games/{g}/accuse, GET /games/{g}/reveal,
WS /games/{g}/events
"""

import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import db, games

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(message)s")

app = FastAPI(title="HEARSAY")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _game_or_404(fn, g: str):
    try:
        return fn(g)
    except games.GameNotFound:
        raise HTTPException(status_code=404, detail=f"no game {g!r}") from None


@app.get("/health")
def health() -> dict:
    return {"ok": True, "graphs": len(db.list_graphs())}


@app.post("/games")
def create_game() -> dict:
    """Copy the 13 template graphs (already 12 gossip ticks in) into a new game."""
    return games.create_game()


@app.get("/games/{g}")
def game_status(g: str) -> dict:
    return _game_or_404(games.status, g)


@app.get("/games/{g}/village")
def village(g: str) -> dict:
    """People, map, who knows whom, gossip hubs (Q4, PageRank) and circles (Q5, cached per game)."""
    return _game_or_404(games.village, g)


@app.get("/debug/queries")
def recent_queries(limit: int = 100) -> dict:
    """The live query monitor: the latest queries with graph and ms, plus per-query totals."""
    return {"recent": list(db.RECENT)[-limit:], "stats": db.query_stats()}
