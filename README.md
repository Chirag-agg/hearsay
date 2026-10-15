# HEARSAY

*A village that remembers. A graph that never lies.*

A murder mystery in a village of 10 AI villagers. Each villager keeps its own memory graph in FalkorDB, rumors mutate as they pass from person to person, and you (or a detective agent over MCP) solve the case with graph queries, following the exact chain of who told whom.

Graph Hacks 2026 (WeMakeDevs × FalkorDB). Tracks: **Agent Memory and Coordination** and **Agents That Act on Connected Data**.

The full design (graph model, every query, gossip engine, agents, demo script) is in [HEARSAY — Murder Mystery Architecture (Graph Hacks).md](<HEARSAY — Murder Mystery Architecture (Graph Hacks).md>).

## The case

Silas Crane, the moneylender, is found dead at the Old Mill at 06:00. Time of death 21:00 to 22:00. The blacksmith's hammer is missing. You have one day, 08:00 to 16:00: every question costs 30 minutes, and the village keeps gossiping while you ask.

- **PageRank** says Bess the barkeep hears everything. She repeats that "a man with a lantern" was near the Mill at 22:00.
- **"Who told you?"** follows that rumor back, one villager graph at a time: Bess ← Brann ← Hale ← Pip. Pip actually saw *a woman* with a lantern on the Riverside path at 21:30. Each hop changed one detail.
- **Contradictions** light up: Elena says she was at the Chapel until 22:00; Father Aldric saw her leave at 21:00. Chapel to Mill is a 20-minute walk (weighted shortest path); she had 30.
- **The ranking flips**: while the sighting is "a man", Jonas leads 12 to 9. Once the trace reaches Pip, Elena leads 12 to 9.

## Why it needs the graph

Remove FalkorDB and the villagers lose their memories, rumors stop spreading, and no contradiction can be found. Each game is **13 graphs in one FalkorDB instance**, copied from templates with `GRAPH.COPY`:

| Graph | Holds |
| --- | --- |
| `game_<g>_npc_<id>` ×10 | One villager's beliefs: claims, who told them, trust, past conversations, a liar's rules. An agent can only read its own. |
| `game_<g>_village` | Public: people, the map (`ROAD {minutes}`), who knows whom (`KNOWS {closeness}`). |
| `game_<g>_case` | Your case board: statements, claims, `SOURCED_FROM` / `DERIVED_FROM` chains, contradictions, `IMPLICATES`. |
| `game_<g>_world` | The hidden truth and a log of every gossip hop. Only the reveal reads it. |

FalkorDB features used: PageRank (`algo.pageRank`), label propagation (`algo.labelPropagation`), weighted shortest paths (`algo.SPpaths`), variable-length paths with zero-length hops (`*0..8`), `MERGE` upserts, indexes, `GRAPH.COPY` per game, read-only queries for everything agents call, and one graph per agent for isolation. The live query monitor in the UI shows every query with its graph and milliseconds.

## Run it

Needs Docker, Python 3.11+ and Node 20+.

```bash
cp .env.example .env
docker compose up -d falkordb
python -m venv .venv
.venv/Scripts/activate        # Windows; .venv/bin/activate on macOS/Linux
pip install -r backend/requirements.txt
python scripts/seed.py
```

Then start the backend and the frontend (two terminals):

```bash
cd backend && uvicorn app.main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. FalkorDB Browser is at http://localhost:3000.

Everything in Docker instead: `docker compose up --build`, then http://localhost:5173 (the backend seeds the templates on first start).

**FalkorDB Cloud:** set `FALKORDB_HOST` (no port), `FALKORDB_PORT`, `FALKORDB_USERNAME` and `FALKORDB_PASSWORD` in `.env`. On the 100 MB tier each game uses about 14 MB, so `MAX_GAMES=5` keeps the newest five games and deletes the least recently used one.

If something else already uses port 6379 (an error like `unknown command 'GRAPH.LIST'` means you reached a plain Redis), set `FALKORDB_HOST_PORT=6380` and `FALKORDB_PORT=6380` in `.env`.

**LLM (optional):** any OpenAI-compatible API (`LLM_PROVIDER=groq` or `openai`, `LLM_MODEL`, `LLM_API_KEY`). The LLM only words answers and picks the detective's tools. With `REPLAY=1`, or no LLM configured, villagers answer in template sentences and the detective follows a scripted plan, so every run is identical.

## Playing

Click a villager and your detective walks over; the camera closes in and they answer in their own voice. Everything they say becomes an evidence card. On hearsay, ask **“Who told you?”** and go and question the source: that's how you walk a rumor back to whoever actually saw it. The compass in the corner suggests the next lead, and a gold **!** marks who to see.

| Control | Does |
| --- | --- |
| Click a villager | Walk over and question them |
| Drag · scroll | Look around · zoom |
| 1–4 | Pick a question in a conversation |
| N | Notebook: evidence, red-string contradictions, wanted posters, rumor traces, the raw graph |
| M | Sound on or off (all synthesized; no audio files) |
| Esc | Close a panel or leave a conversation |

The top bar sends for **Inspector Graves** (the MCP detective agent, who walks the village as he works), opens **Mind's eye** (every villager's memory graph), the **Graph lens** (every FalkorDB query, live), and **Accuse**, which ends in a flashback of what really happened.

## Play from the terminal

```bash
python scripts/ask.py aldric "Was Elena at prayer all evening?"     # one question (reads the templates)
python scripts/replay_demo.py                                       # the whole solving path, with checks
python scripts/run_detective.py                                     # the detective solves a new game over MCP
```

## Checks

| Script | Checks |
| --- | --- |
| `smoke_cypher.py` | Every query runs on FalkorDB with the expected answers on a fixture, then on the seeded templates |
| `check_engine.py` | The same seed gives the same village: reseeding and two games match node for node |
| `check_agent.py` | Villagers answer the demo's questions from the right claims; the guardrail rejects invented details |
| `replay_demo.py` | The intended solving path end to end: contradictions, the trace, the 12/9 flip, accusation, reveal, session two |
| `check_killer.py` | The killer reacts: Elena plants a lie or changes her story when she hears what you asked, and gets caught |
| `run_detective.py --check` | The detective accuses the killer using only MCP tools |

## How it works

**Villager agent** (`backend/app/npc`): parse the question, then retrieve from the villager's own graph only (Q1 by person, Q1b by place, Q1d to follow a rumor). An active `Rule` replaces the truth with the liar's lie inside the query. A `Gate` holds a secret until trust is high enough or you cite the right statement: Lady Wren confirms Jonas only when shown Bess's "he left toward the Manor". The answer is then worded by the LLM or a template. A **guardrail** checks every person, place and time against the claims the answer cites; a failing answer gets one stricter retry, then falls back to the template.

**Gossip engine** (`backend/app/engine`): each 30-minute tick is planned sequentially with a seeded RNG (who talks, which claims via Q2, which detail mutates), then written in parallel, one task per listener graph. One detail can change per hop, shaped by the teller: Hale shifts times, Pip muddles people, Brann moves places. Every hop is logged in the truth graph. Claim ids are `uuid5` of the seed, so the same seed gives the same village.

**Case board** (`backend/app/case`): each answer becomes a `Statement` asserting `Claim`s (`saw` or `heard`). Heard claims link `SOURCED_FROM` their teller and `DERIVED_FROM` the source's own claim once the source is asked. After every answer, Q6a, Q6b and Q11 find contradictions, each merged once on a key. `IMPLICATES` is recomputed by backing (Q8a), and Q13 confirms alibis only through independent eyewitness origins. `root_id` never leaves the backend, so you trace rumors by asking, not by grouping.

**Detective** (`backend/app/detective`, `backend/mcp_server`): 14 tools on the `hearsay-graph` MCP server. Each returns the Cypher it ran and none can read the truth graph. The detective connects over MCP (in-process by default, stdio with `DETECTIVE_TRANSPORT=stdio`), lets the LLM pick tools, and falls back to a scripted plan that finishes from the board if the LLM stalls or hits a rate limit. External MCP clients can use the server too: `python backend/mcp_server/server.py`.

**The killer reacts:** ask about the hammer, and the villager you asked stores "the detective asked about the hammer"; it spreads like gossip. When it reaches Elena she plants a lie (Jonas carried his hammer to the Mill at 20:45), which Q6a then pins on her. `KILLER_REACTS=0` turns it off.

## API

| Route | What it does |
| --- | --- |
| `POST /games` | New game: copies the 13 templates (already 12 gossip ticks in) |
| `GET /games/{g}` · `POST /games/{g}/session` | Clock and questions left · come back tomorrow |
| `GET /games/{g}/village` | People, map, who knows whom, PageRank hubs, circles, and the Cypher behind them |
| `POST /games/{g}/ask` | `{villager_id, question, cite_statement_ids?, about_claim_id?}`: answer, claim chips, new contradictions |
| `POST /games/{g}/claims/{id}/source` | "Who told you?" |
| `GET /games/{g}/trace/{id}` | The rumor chain with what changed at each hop |
| `GET /games/{g}/case` · `/contradictions` · `/suspects` | Case board graph, contradictions with who they implicate plus leads, Q14 ranking |
| `POST /games/{g}/detective` | Hand over to the detective agent |
| `POST /games/{g}/accuse` · `GET /games/{g}/reveal` | Score an accusation against the truth · truth beside belief |
| `GET /games/{g}/god` | Every villager's memory side by side (demo) |
| `WS /games/{g}/events` · `GET /debug/queries` | Live events · live query monitor |

## Repository layout

```text
backend/
  app/main.py          FastAPI routes and the WebSocket
  app/db.py            FalkorDB client, graph names, db.run (every query, logged)
  app/queries/         one .cypher file per query (all listed below)
  app/scenario/        hollowmere.json (the case) and the tpl_* loader
  app/seed.py          builds the templates and runs the pre-game gossip
  app/engine/          gossip ticks, the killer's reactions
  app/npc/             villager agent: parser, renderer, guardrail, LLM
  app/case/            case writer, contradiction checks, verdict and reveal
  app/play.py          one interrogation, start to finish
  app/detective/       MCP tools and the detective agent
  mcp_server/server.py the hearsay-graph MCP server
frontend/src/          village map, interrogation, case board, detective, accusation, God view
frontend/public/sprites/  the cast's LPC walk sheets and their CREDITS.md
scripts/               seed, ask, replay_demo, run_detective, build_sprites and the checks
```

## Cypher queries

Every query lives in its own file in [backend/app/queries](backend/app/queries). This section is generated from them by `python scripts/readme_queries.py`.

<!-- queries:start -->

### `indexes`

**Indexes. Run once per template graph; GRAPH.COPY carries them into every game.** One statement per semicolon. Statement and Contradiction indexes back the case-graph MERGEs.

```cypher
CREATE INDEX FOR (c:Claim) ON (c.id);
CREATE INDEX FOR (c:Claim) ON (c.root_id);
CREATE INDEX FOR (p:Person) ON (p.id);
CREATE INDEX FOR (pl:Place) ON (pl.id);
CREATE INDEX FOR (s:Statement) ON (s.id);
CREATE INDEX FOR (x:Contradiction) ON (x.key)
```

### `q01_recall`

**Q1. What do I believe about this person in this window?** Graph: game_<g>_npc_<id> (the villager's own memory) Params: $person, $t_from, $t_to Private claims (secrets) never come out unless a Gate guards them; the agent opens the gate. An active Rule covers its topic: it drops the claims it `hides`, and every other claim about its subject inside its window (gossip a liar has heard about herself), except its own lie. That happens before LIMIT, so the lie can't be crowded out. Dormant lies sit at confidence 0 until W2 switches their rule on. claim_id breaks ties so REPLAY=1 gets the same five claims.

```cypher
MATCH (c:Claim)-[:ABOUT]->(x {id: $person})
WHERE c.t_from <= $t_to AND c.t_to >= $t_from AND c.confidence >= 0.2
  AND (coalesce(c.private, false) = false OR coalesce(c.gated, false))
OPTIONAL MATCH (r:Rule {active: true})
WHERE c.id IN r.hides
   OR (r.subject_id = c.subject_id AND c.t_from < r.t_to AND r.t_from < c.t_to AND NOT c.id IN r.uses)
WITH c, count(r) AS hidden_by
WHERE hidden_by = 0
OPTIONAL MATCH (c)-[:AT]->(pl:Place)
OPTIONAL MATCH (c)-[:HEARD_FROM]->(src:Person)
RETURN c.id AS claim_id, c.pred AS pred, pl.name AS place, c.t_from AS t_from, c.t_to AS t_to,
       c.confidence AS confidence, c.origin AS origin, src.name AS heard_from
ORDER BY confidence DESC, claim_id
LIMIT 5
```

### `q01b_recall_place`

**Q1b. What do I believe happened at this place in this window?** Graph: game_<g>_npc_<id> (the villager's own memory) Params: $place, $t_from, $t_to Q1 is keyed on a person, so a sighting about a Description ("a man near the Mill") needs this one. x is unlabeled: ABOUT points at a Person (name) or a Description (text). Like Q1, claims an active Rule covers are dropped before LIMIT.

```cypher
MATCH (c:Claim)-[:AT]->(pl:Place {id: $place})
WHERE c.t_from <= $t_to AND c.t_to >= $t_from AND c.confidence >= 0.2
  AND (coalesce(c.private, false) = false OR coalesce(c.gated, false))
OPTIONAL MATCH (r:Rule {active: true})
WHERE c.id IN r.hides
   OR (r.subject_id = c.subject_id AND c.t_from < r.t_to AND r.t_from < c.t_to AND NOT c.id IN r.uses)
WITH c, count(r) AS hidden_by
WHERE hidden_by = 0
OPTIONAL MATCH (c)-[:ABOUT]->(x)
OPTIONAL MATCH (c)-[:HEARD_FROM]->(src:Person)
RETURN c.id AS claim_id, c.pred AS pred, coalesce(x.name, x.text) AS who,
       c.t_from AS t_from, c.t_to AS t_to, c.confidence AS confidence,
       c.origin AS origin, src.name AS heard_from
ORDER BY confidence DESC, claim_id
LIMIT 5
```

### `q01c_claim_details`

**Q1c. Everything the renderer needs about the claims Q1/Q1b picked.** Graph: game_<g>_npc_<id> (the villager's own memory) Params: $claim_ids Q1 and Q1b return just enough to rank claims; this fills in who, what, where and from whom, so the answer (template or LLM) is built from graph facts only. Python restores the input order. root_id is for the case writer only; it never leaves the backend.

```cypher
UNWIND $claim_ids AS cid
MATCH (c:Claim {id: cid})
OPTIONAL MATCH (c)-[:ABOUT]->(x)
OPTIONAL MATCH (c)-[:AT]->(pl:Place)
OPTIONAL MATCH (c)-[:INVOLVES]->(o:Object)
OPTIONAL MATCH (c)-[:HEARD_FROM]->(src:Person)
OPTIONAL MATCH (tw:Place {id: c.toward_id})
OPTIONAL MATCH (op:Person {id: c.object_id})
RETURN c.id AS claim_id, c.root_id AS root_id, c.pred AS pred, c.subject_id AS subject_id, coalesce(x.name, x.text) AS who,
       c.place_id AS place_id, pl.name AS place, c.object_id AS object_id, coalesce(o.name, op.name) AS object,
       c.toward_id AS toward_id, tw.name AS toward,
       c.t_from AS t_from, c.t_to AS t_to, c.confidence AS confidence, c.origin AS origin,
       c.crowns AS crowns, c.note AS note, src.id AS heard_from_id, src.name AS heard_from
```

### `q01d_recall_rumor`

**Q1d. What do I believe about this rumor? Following "who told you?" one hop back.** Graph: game_<g>_npc_<id> (the source villager's own memory) Params: $root_id The backend maps the case claim the player clicked to its root_id, which never leaves the backend, and asks the source villager for their own version of that same rumor.

```cypher
MATCH (c:Claim {root_id: $root_id})
WHERE c.confidence >= 0.2 AND (coalesce(c.private, false) = false OR coalesce(c.gated, false))
RETURN c.id AS claim_id, c.pred AS pred, c.t_from AS t_from, c.t_to AS t_to,
       c.confidence AS confidence, c.origin AS origin
ORDER BY confidence DESC, claim_id
LIMIT 3
```

### `q02_next_gossip`

**Q2. What will I gossip about next?** Graph: game_<g>_npc_<id> (the teller) Params: $listener_roots (root_ids the listener already holds) c.id breaks ties so equal scores come back in an order the seed controls.

```cypher
MATCH (c:Claim)
WHERE c.confidence >= 0.2 AND coalesce(c.private, false) = false AND NOT c.root_id IN $listener_roots
RETURN c
ORDER BY c.salience * c.confidence DESC, c.id
LIMIT 2
```

### `q03_who_told_me`

**Q3. Who told me?** Graph: game_<g>_npc_<id> Params: $claim_id

```cypher
MATCH (c:Claim {id: $claim_id})-[h:HEARD_FROM]->(src:Person)
RETURN src.id AS source_id, src.name AS source, h.tick AS tick
```

### `q04_gossip_hubs`

**Q4. Who hears the most gossip? PageRank over KNOWS.** Graph: game_<g>_village Params: none

```cypher
CALL algo.pageRank('Person', 'KNOWS') YIELD node, score
RETURN node.name AS villager, score
ORDER BY score DESC
LIMIT 3
```

### `q05_circles`

**Q5. Which circles cover for each other? Label propagation (CDLP).** Graph: game_<g>_village. Results can vary between runs: compute once per game and cache. Params: none

```cypher
CALL algo.labelPropagation({nodeLabels: ['Person'], relationshipTypes: ['KNOWS']})
YIELD node, communityId
RETURN communityId, collect(node.name) AS circle
ORDER BY size(circle) DESC
```

### `q06a_two_places`

**Q6a. Same person, two places at once. First-hand claims only, strict overlap, different tellers.** Graph: game_<g>_case Params: none The WITH is required: without it FalkorDB 4.x drops the s-c pairing when the second MATCH reuses s1/s2, and returns statements joined to claims they never asserted (smoke_cypher.py checks this).

```cypher
MATCH (s1:Statement)-[:ASSERTS]->(c1:Claim {pred: 'WAS_AT', reported_as: 'saw'}),
      (s2:Statement)-[:ASSERTS]->(c2:Claim {pred: 'WAS_AT', reported_as: 'saw'})
WHERE c1.subject_id = c2.subject_id AND c1.place_id <> c2.place_id
  AND c1.t_from < c2.t_to AND c2.t_from < c1.t_to AND c1.id < c2.id
WITH s1, c1, s2, c2
MATCH (s1)-[:SAID_BY]->(n1:Person), (s2)-[:SAID_BY]->(n2:Person)
WHERE n1.id <> n2.id
RETURN c1.subject_id AS person, n1.name AS says_1, c1.place_id AS place_1,
       n2.name AS says_2, c2.place_id AS place_2, s1.id AS stmt_1, s2.id AS stmt_2,
       c1.id AS claim_1, c2.id AS claim_2
```

### `q06b_stayed_but_left`

**Q6b. Claims to have stayed, but someone saw them leave. The whole LEFT window must fall inside the stay.** Graph: game_<g>_case Params: none The WITH is required: see q06a_two_places.cypher.

```cypher
MATCH (s1:Statement)-[:ASSERTS]->(c1:Claim {pred: 'WAS_AT', reported_as: 'saw'}),
      (s2:Statement)-[:ASSERTS]->(c2:Claim {pred: 'LEFT', reported_as: 'saw'})
WHERE c1.subject_id = c2.subject_id AND c1.place_id = c2.place_id
  AND c2.t_from > c1.t_from AND c2.t_to < c1.t_to
WITH s1, c1, s2, c2
MATCH (s1)-[:SAID_BY]->(n1:Person), (s2)-[:SAID_BY]->(n2:Person)
WHERE n1.id <> n2.id
RETURN c1.subject_id AS person, c1.place_id AS place, n1.name AS claims_stayed,
       c1.t_to AS until, n2.name AS says_left, c2.t_from AS left_at, s1.id AS stmt_1, s2.id AS stmt_2,
       c1.id AS claim_1, c2.id AS claim_2
```

### `q07_trace_rumor`

**Q7. Trace a rumor to its origin. Python diffs consecutive hops to highlight what changed.** Graph: game_<g>_case Params: $claim_id

```cypher
MATCH path = (c:Claim {id: $claim_id})-[:DERIVED_FROM*0..8]->(origin:Claim)
WITH path, origin
ORDER BY length(path) DESC
LIMIT 1
OPTIONAL MATCH (origin)-[:SOURCED_FROM]->(next:Person)
RETURN [n IN nodes(path) | {claim: n.id, teller: n.teller_id, about: n.subject_id,
         place: n.place_id, t_from: n.t_from, reported_as: n.reported_as}] AS chain,
       origin.reported_as = 'saw' AS reached_eyewitness, next.id AS ask_next
```

### `q08a_backing`

**Q8a. How many people back this claim? Distinct other tellers, first-hand, same predicate/person/place, overlapping time.** Graph: game_<g>_case. Used by the IMPLICATES rule. Params: $claim_id

```cypher
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {id: $claim_id}), (s)-[:SAID_BY]->(teller:Person)
OPTIONAL MATCH (s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'}), (s2)-[:SAID_BY]->(t2:Person)
WHERE t2.id <> teller.id AND c2.pred = c.pred AND c2.subject_id = c.subject_id
  AND c2.place_id = c.place_id AND c2.t_from < c.t_to AND c.t_from < c2.t_to
RETURN count(DISTINCT t2) AS backing
```

### `q08b_leads`

**Q8b. Eyewitness claims nobody else backs up. Leads, not contradictions: never drawn as red edges.** Graph: game_<g>_case Params: none

```cypher
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {reported_as: 'saw'}), (s)-[:SAID_BY]->(teller:Person)
WHERE c.subject_id <> teller.id
OPTIONAL MATCH (s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'}), (s2)-[:SAID_BY]->(t2:Person)
WHERE t2.id <> teller.id AND c2.pred = c.pred AND c2.subject_id = c.subject_id
  AND c2.place_id = c.place_id AND c2.t_from < c.t_to AND c.t_from < c2.t_to
WITH s, c, teller, count(DISTINCT t2) AS backing
WHERE backing = 0
RETURN teller.name AS only_source, c.pred AS what, c.subject_id AS about, c.place_id AS place,
       c.t_from AS t_from, s.tick AS first_told
```

### `q09_past_questions`

**Q9. What has this player asked me before? Episodic memory for the persona prompt.** Graph: game_<g>_npc_<id> Params: $player

```cypher
MATCH (:Self)-[:HAD]->(conv:Conversation {player_id: $player})-[:INCLUDED]->(q:Question)
OPTIONAL MATCH (q)-[a:ANSWERED_WITH]->(c:Claim)
RETURN conv.session AS session, q.tick AS tick, q.text AS asked, collect(c.id) AS answered_with
ORDER BY tick DESC
LIMIT 3
```

### `q10_travel`

**Q10. Could they get there in time? Weighted shortest path over ROAD.minutes.** Graph: game_<g>_case (seeded with the public map) or game_<g>_village Params: $from_place, $to_place, $from_t, $to_t

```cypher
MATCH (a:Place {id: $from_place}), (b:Place {id: $to_place})
CALL algo.SPpaths({sourceNode: a, targetNode: b, relTypes: ['ROAD'],
                   weightProp: 'minutes', relDirection: 'outgoing'})
YIELD path, pathWeight
RETURN pathWeight AS minutes_needed, $to_t - $from_t AS minutes_available,
       pathWeight <= $to_t - $from_t AS possible, [n IN nodes(path) | n.name] AS route
```

### `q11_changed_story`

**Q11. Stories that changed between questions. First-hand only; the lie counted is the earlier claim (claim_1).** Graph: game_<g>_case Params: none

```cypher
MATCH (n:Person)<-[:SAID_BY]-(s1:Statement)-[:ASSERTS]->(c1:Claim {reported_as: 'saw'}),
      (n)<-[:SAID_BY]-(s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'})
WHERE s1.tick < s2.tick AND c1.pred = c2.pred AND c1.subject_id = c2.subject_id
  AND c1.t_from < c2.t_to AND c2.t_from < c1.t_to AND c1.place_id <> c2.place_id
RETURN n.name AS villager, c1.subject_id AS about, c1.place_id AS first_said,
       s1.session AS session_1, c2.place_id AS later_said, s2.session AS session_2,
       s1.id AS stmt_1, s2.id AS stmt_2, c1.id AS claim_1, c2.id AS claim_2
```

### `q12_suspects_fitting`

**Q12. Who fits the description and has no confirmed alibi? Run Q13 for every match first.** Graph: game_<g>_case Params: $description_id

```cypher
MATCH (d:Description {id: $description_id})-[:FITS]->(p:Person)
WHERE p.alibi_confirmed IS NULL OR p.alibi_confirmed = false
RETURN p.id AS suspect_id, p.name AS suspect
```

### `q13_alibi`

**Q13. Is this alibi really confirmed by independent sources? Only eyewitness origins count.** Graph: game_<g>_case. The backend writes alibi_confirmed only when $t is the time of death. Params: $person, $t, $scene

```cypher
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {pred: 'WAS_AT'})
WHERE c.subject_id = $person AND c.t_from <= $t AND c.t_to >= $t
  AND c.place_id <> $scene AND c.teller_id <> $person
MATCH (c)-[:DERIVED_FROM*0..8]->(o:Claim)
OPTIONAL MATCH (o)-[nx:DERIVED_FROM]->(:Claim)
WITH c, o, nx WHERE nx IS NULL
WITH c.place_id AS place,
     collect(DISTINCT CASE WHEN o.reported_as = 'saw' THEN o.teller_id END) AS eyewitnesses,
     collect(DISTINCT CASE WHEN o.reported_as = 'heard' THEN c.id END) AS unverified
RETURN place, eyewitnesses, unverified, size(eyewitnesses) >= 2 AS confirmed
```

### `q14_rank_suspects`

**Q14. Rank the suspects: motive, means, lies (via IMPLICATES), fit to the scene sighting, alibi.** Graph: game_<g>_case Params: $victim, $weapon_place, $death_t, $sighting FalkorDB 4.x: after an OPTIONAL MATCH + aggregation, a later OPTIONAL MATCH anchored on p that filters the other end ({id: $sighting} or WHERE d.id = $sighting) matches nothing. Collecting the descriptions p fits and testing membership works; smoke_cypher.py checks it.

```cypher
MATCH (p:Person) WHERE p.id <> $victim
OPTIONAL MATCH (:Statement)-[:ASSERTS]->(m:Claim)
WHERE m.pred IN ['OWES', 'THREATENED', 'ARGUED_WITH']
  AND ((m.subject_id = p.id AND m.object_id = $victim) OR (m.subject_id = $victim AND m.object_id = p.id))
WITH p, count(DISTINCT m.pred) AS motive
OPTIONAL MATCH (:Statement)-[:ASSERTS]->(w:Claim)
WHERE w.subject_id = p.id AND w.place_id = $weapon_place AND w.t_to <= $death_t
WITH p, motive, count(w) AS means
OPTIONAL MATCH (:Contradiction)-[i:IMPLICATES]->(p)
WITH p, motive, means, count(DISTINCT i.root_id) AS lies
OPTIONAL MATCH (d:Description)-[:FITS]->(p)
WITH p, motive, means, lies, CASE WHEN $sighting IN collect(d.id) THEN 1 ELSE 0 END AS fits
RETURN p.id AS suspect_id, p.name AS suspect, motive, means, lies, fits, coalesce(p.alibi_confirmed, false) AS alibi,
       motive * 2 + CASE WHEN means > 0 THEN 3 ELSE 0 END + lies * 2 + fits * 3
         - CASE WHEN coalesce(p.alibi_confirmed, false) THEN 5 ELSE 0 END AS score
ORDER BY score DESC
```

### `w01_merge_contradiction`

**W1. Store a contradiction once. key = kind + the two claim ids, sorted.** Graph: game_<g>_case. IMPLICATES edges are recomputed separately on every check. Params: $key, $kind, $claim_1, $claim_2, $detail, $tick, $stmt_1, $stmt_2

```cypher
MERGE (x:Contradiction {key: $key})
ON CREATE SET x.kind = $kind, x.claim_1 = $claim_1, x.claim_2 = $claim_2,
              x.detail = $detail, x.tick = $tick, x.new = true
ON MATCH SET x.new = false
WITH x
MATCH (s1:Statement {id: $stmt_1}), (s2:Statement {id: $stmt_2})
MERGE (x)-[:INVOLVES]->(s1)
MERGE (x)-[:INVOLVES]->(s2)
RETURN x.new AS new
```

### `w02_activate_rule`

**W2. Switch a liar's rule on. The only way to activate one.** Graph: game_<g>_npc_<id> Params: $rule_id Rule.active and its claims' confidence change in one statement, so they can't disagree: dormant lie claims sit at confidence 0 (Q1 and Q2 skip them) until their rule fires. A rule that supersedes another (Elena's changed story replaces her cover story) switches the old one off.

```cypher
MATCH (r:Rule {id: $rule_id})
SET r.active = true
WITH r
OPTIONAL MATCH (r)-[:USES]->(c:Claim)
SET c.confidence = 1.0, c.dormant = false
WITH r, count(c) AS claims
OPTIONAL MATCH (old:Rule {id: r.supersedes})
SET old.active = false
RETURN r.id AS rule_id, claims, old.id AS superseded
```

<!-- queries:end -->

## AI assistance disclosure

This project was built with AI coding assistants. The architecture doc was drafted with Claude, and Claude Code wrote most of the code in this repository (backend, queries, gossip engine, agents, MCP server, frontend and the check scripts) under the team's direction and review. In the running game, an LLM only puts graph facts into words and picks the detective's tools; every fact comes from FalkorDB, and the guardrail rejects anything that doesn't.

## Data

All people, places and events are fictional and synthetic.

## Art

The character sprites are composed from [Liberated Pixel Cup](https://lpc.opengameart.org/) art, via the
[Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).
Each piece is licensed CC-BY-SA, OGA-BY, GPL or CC0. The authors and licenses for every file we use are in
[frontend/public/sprites/CREDITS.md](frontend/public/sprites/CREDITS.md). The composed sheets are shared under the same terms.
To rebuild them, check out the generator and run `python scripts/build_sprites.py <checkout>`. The cast's
outfits are in `scripts/sprites.json`, and `--list` prints the sprite files a sparse checkout needs.
