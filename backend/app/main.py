"""FastAPI entry point. Routes from the architecture doc are added as each layer lands:

POST /games, GET /games/{g}, GET /games/{g}/village, POST /games/{g}/ask,
POST /games/{g}/claims/{claim_id}/source, GET /games/{g}/case,
GET /games/{g}/contradictions, GET /games/{g}/trace/{claim_id},
POST /games/{g}/detective, POST /games/{g}/accuse, GET /games/{g}/reveal,
WS /games/{g}/events
"""

from fastapi import FastAPI

from app import db

app = FastAPI(title="HEARSAY")


@app.get("/health")
def health() -> dict:
    client = db.connect()
    return {"ok": True, "graphs": len(client.list_graphs())}
