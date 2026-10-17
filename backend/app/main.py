"""FastAPI entry point: every route the game uses.

Game:      POST /games, GET /games/{g}, POST /games/{g}/session, GET /games/{g}/village
Play:      POST /games/{g}/ask, POST /games/{g}/claims/{claim_id}/source
Case:      GET /games/{g}/case, GET /games/{g}/contradictions, GET /games/{g}/trace/{claim_id},
           GET /games/{g}/suspects
Detective: POST /games/{g}/detective
End:       POST /games/{g}/accuse, GET /games/{g}/reveal, GET /games/{g}/god (demo)
Live:      WS /games/{g}/events (or GET /games/{g}/events?since=n), GET /debug/queries
"""

import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import db, events, games, play
from app.case import verdict

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(message)s")

class StripPrefix:
    """Serve every route under an optional prefix too. On Vercel the frontend and the API share one
    domain and the API is reached at /api/..., with the original path passed through; locally and in
    Docker the API is at the root."""

    def __init__(self, app, prefix: str = "/api"):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] in ("http", "websocket") and (path == self.prefix or path.startswith(self.prefix + "/")):
            rest = path[len(self.prefix):] or "/"
            scope = {**scope, "path": rest, "raw_path": rest.encode()}
        await self.app(scope, receive, send)


app = FastAPI(title="HEARSAY")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(StripPrefix, prefix=os.getenv("API_PREFIX", "/api"))


@app.on_event("startup")
def seed_if_missing() -> None:
    """A fresh FalkorDB (new Cloud instance, new Docker volume) gets its templates on first start."""
    from app import seed

    log = logging.getLogger("hearsay")
    try:
        if os.getenv("AUTO_SEED", "1") == "1" and not seed.templates_ready():
            log.info("tpl_* graphs missing: seeding (this takes ~1 s locally, ~45 s on Cloud)")
            seed.seed(verbose=False)
    except Exception as exc:  # FalkorDB not up yet: serve anyway; /health and POST /games will say so
        log.warning("could not check or seed the templates at startup: %s", exc)


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except games.GameNotFound as exc:
        raise HTTPException(status_code=404, detail=f"no game {exc.args[0]!r}") from None
    except play.BadRequest as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except play.OutOfTime as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


class AskBody(BaseModel):
    villager_id: str
    question: str = Field(min_length=1, max_length=500)
    cite_statement_ids: list[str] = []
    about_claim_id: str | None = None  # following "who told you?": ask the source about this rumor


class AccuseBody(BaseModel):
    suspect_id: str
    motive: str = ""
    statement_ids: list[str] = []


class DetectiveBody(BaseModel):
    max_steps: int = Field(default=30, ge=1, le=40)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "graphs": len(db.list_graphs())}


@app.post("/games")
def create_game() -> dict:
    """Copy the 13 template graphs (already 12 gossip ticks in) into a new game."""
    return games.create_game()


@app.get("/games/{g}")
def game_status(g: str) -> dict:
    return _call(games.status, g)


@app.post("/games/{g}/session")
def new_session(g: str) -> dict:
    return _call(games.new_session, g)


@app.get("/games/{g}/village")
def village(g: str) -> dict:
    """People, map, who knows whom, gossip hubs (Q4, PageRank) and circles (Q5, cached per game)."""
    return _call(games.village, g)


@app.post("/games/{g}/ask")
def ask(g: str, body: AskBody) -> dict:
    """Question a villager. Costs 30 in-game minutes and runs one gossip tick."""
    return _call(play.ask, g, body.villager_id, body.question,
                 cite_statement_ids=body.cite_statement_ids, about_claim_id=body.about_claim_id)


@app.post("/games/{g}/claims/{claim_id}/source")
def who_told(g: str, claim_id: str) -> dict:
    return _call(play.source, g, claim_id)


@app.get("/games/{g}/case")
def case_board(g: str) -> dict:
    return _call(play.case_board, g)


@app.get("/games/{g}/contradictions")
def contradictions(g: str) -> dict:
    return _call(play.contradictions, g)


@app.get("/games/{g}/trace/{claim_id}")
def trace(g: str, claim_id: str) -> dict:
    return _call(play.trace, g, claim_id)


@app.get("/games/{g}/suspects")
def suspects(g: str, sighting: str | None = None) -> dict:
    return _call(play.suspects, g, sighting)


@app.post("/games/{g}/detective")
def detective(g: str, body: DetectiveBody) -> dict:
    from app.detective.agent import run_detective
    return _call(run_detective, g, max_steps=body.max_steps)


@app.post("/games/{g}/accuse")
def accuse(g: str, body: AccuseBody) -> dict:
    return _call(verdict.accuse, g, body.suspect_id, body.motive, body.statement_ids)


@app.get("/games/{g}/reveal")
def reveal(g: str) -> dict:
    return _call(verdict.reveal, g)


@app.get("/games/{g}/god")
def god_view(g: str) -> dict:
    if os.getenv("GOD_VIEW", "1") != "1":
        raise HTTPException(status_code=404, detail="God view is off")
    return _call(verdict.god_view, g)


@app.get("/games/{g}/events")
def poll_events(g: str, since: int = 0) -> dict:
    return {"events": events.since(g, since)}


@app.websocket("/games/{g}/events")
async def event_stream(ws: WebSocket, g: str) -> None:
    await ws.accept()
    seq = int(ws.query_params.get("since", 0))
    try:
        while True:
            for e in events.since(g, seq):
                await ws.send_json(e)
                seq = e["seq"] + 1
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


@app.get("/debug/queries")
def recent_queries(limit: int = 100) -> dict:
    """The live query monitor: the latest queries with graph and ms, plus per-query totals."""
    return {"recent": list(db.RECENT)[-limit:], "stats": db.query_stats()}
