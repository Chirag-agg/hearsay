# HEARSAY

*A village that remembers. A graph that never lies.*

A murder mystery in a village of 10 AI villagers. Each villager keeps its own memory graph in FalkorDB, rumors mutate as they pass from person to person, and a detective agent solves the case with graph queries and shows the exact chain of who told whom.

Graph Hacks 2026 entry. Tracks: **Agent Memory and Coordination** and **Agents That Act on Connected Data**.

The full design (graph model, all queries, gossip engine, agents, demo script) is in [HEARSAY — Murder Mystery Architecture (Graph Hacks).md](<HEARSAY — Murder Mystery Architecture (Graph Hacks).md>).

## Status

FalkorDB, the query files, the demo case (`backend/app/scenario/hollowmere.json`), the template seeder and the query smoke test are in place; the engine, agents and frontend are not written yet.

## Local setup

Needs Docker and Python 3.11+.

```bash
cp .env.example .env
docker compose up -d falkordb
python -m venv .venv
.venv/Scripts/activate        # Windows; use .venv/bin/activate on macOS/Linux
pip install -r backend/requirements.txt
python scripts/seed.py
python scripts/smoke_cypher.py
```

`seed.py` rebuilds the 13 `tpl_*` template graphs from the demo case; run it again after any change to the JSON. `smoke_cypher.py` runs every query on a small fixture graph, then checks the answers the demo depends on against the templates, and must pass before any query is wired into code. FalkorDB Browser is at http://localhost:3000.

If something else already uses port 6379 (an error like `unknown command 'GRAPH.LIST'` means you reached a plain Redis), set `FALKORDB_HOST_PORT=6380` and `FALKORDB_PORT=6380` in `.env` and run `docker compose up -d falkordb` again.

To run the backend in Docker as well: `docker compose up --build`, then open http://localhost:8000/health.

## Repository layout

```text
docker-compose.yml
backend/
  app/main.py           FastAPI routes, SSE, WebSocket
  app/db.py             FalkorDB client, graph names, GRAPH.COPY per game
  app/queries/          one .cypher file per query (listed below)
  app/scenario/         hollowmere.json and the tpl_* loader
  app/engine/           clock, gossip ticks, retelling, mutation, liar rules
  app/npc/              villager agent
  app/case/             statement writer, contradictions, alibis
  app/detective/        detective agent (MCP client)
  mcp_server/server.py  hearsay-graph MCP tools
frontend/src/           pages and components (Vite + React, not created yet)
scripts/
  seed.py               builds the tpl_* graphs
  smoke_cypher.py       checks every query on FalkorDB
  replay_demo.py        plays the intended solving path end to end
```

## Graph data model

Each game uses 13 FalkorDB graphs: `game_<g>_world` (hidden truth), `game_<g>_village` (public), `game_<g>_npc_<id>` (one per villager) and `game_<g>_case` (the player's case board). See "Graph data model" in the architecture doc. TODO: copy the final schema here before submission.

## Cypher queries

Every query the product depends on lives in [backend/app/queries](backend/app/queries):

| File | What it answers |
| --- | --- |
| `q01_recall` | What does this villager believe about a person in a time window? |
| `q01b_recall_place` | What does this villager believe happened at a place in a time window? |
| `q02_next_gossip` | Which claims will a villager retell next? |
| `q03_who_told_me` | Who did this villager hear a claim from? |
| `q04_gossip_hubs` | Who hears the most gossip? (PageRank) |
| `q05_circles` | Which villagers form social circles? (label propagation) |
| `q06a_two_places` | Same person, two places at once |
| `q06b_stayed_but_left` | Claims to have stayed, but someone saw them leave |
| `q07_trace_rumor` | Follow a rumor back to its origin |
| `q08a_backing` | How many independent eyewitnesses back a claim? |
| `q08b_leads` | Eyewitness claims nobody else backs up |
| `q09_past_questions` | What has this player asked a villager before? |
| `q10_travel` | Could someone get there in time? (weighted shortest path) |
| `q11_changed_story` | Stories that changed between questions |
| `q12_suspects_fitting` | Who fits a description and has no confirmed alibi? |
| `q13_alibi` | Is an alibi confirmed by independent eyewitnesses? |
| `q14_rank_suspects` | Rank suspects by motive, means, lies and fit |
| `w01_merge_contradiction` | Store a contradiction exactly once |
| `w02_activate_rule` | Switch a liar's rule on (flag and lie claims in one statement) |
| `indexes` | Indexes created on every template graph |

## AI assistance disclosure

This project uses AI coding assistants. The architecture doc was drafted with Claude, and Claude Code generated this initial scaffold (folder layout, query files, smoke test). TODO: keep this section current as the team builds.

## Data

All people, places and events are fictional and synthetic.
