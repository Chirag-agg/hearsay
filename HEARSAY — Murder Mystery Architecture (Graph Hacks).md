# HEARSAY — Murder Mystery Architecture (Graph Hacks)

Oct 15, 2026 · @Daksh

## Overview

HEARSAY is a murder mystery in a village of 10 AI villagers. Each villager keeps its own memory graph in FalkorDB, rumors mutate as they pass from person to person, and a detective agent solves the case by running graph queries and showing the exact chain of who told whom.

**Pitch:** *A village that remembers. A graph that never lies.*

**Why it needs the graph (rule 3):** the killer is found by following who told whom, checking whether a person could physically travel between two places in time, and spotting when two "independent" witnesses actually share one source. Remove FalkorDB and the villagers lose their memories, rumors stop spreading, and no contradiction can be found.

**How it differs from Revenant** (the earlier WeMakeDevs × Cognee NPC project): explicit Cypher and FalkorDB algorithms instead of a black-box memory API, rumors that change at each hop, a solvable case with hidden ground truth, and a detective agent that acts on what the graph shows.

| Track focus | How HEARSAY covers it |
| --- | --- |
| T2: memory that persists and updates | Each villager has its own graph of claims, beliefs and past conversations, kept between sessions |
| T2: separate memory per user or tenant | One FalkorDB graph per villager, plus a full copy of the village per player |
| T2: shared state and handoffs | A shared village graph of relationships and gossip, read and written by every villager agent |
| T2: episodic, semantic, procedural | Conversations (episodic), claims and trust (semantic), liars' cover-story rules (procedural) |
| T1: graph algorithms as agent tools via MCP | The detective calls PageRank, community detection, weighted shortest path and contradiction queries as MCP tools |
| T1: actions based on the graph | The detective picks who to question next and makes the accusation from what the graph shows |
| T1: explainable results | Every accusation cites statement IDs and the rumor path, with the change at each hop highlighted |

Enter **Track 2 and Track 1** at submission.

## How the game works

The player has one in-game day (08:00 to 16:00) to solve a death. Every question costs 30 in-game minutes, which gives 16 interrogations, and the village keeps gossiping while the player investigates.

1. **New game.** The server copies the template village graphs into a fresh set for this player (`game_<id>_*`). Nothing one player does leaks into another player's village.
2. **Morning briefing.** Silas Crane, the moneylender, is found dead at the Old Mill at 06:00. The physician puts the time of death between 21:00 and 22:00. The blacksmith's hammer is missing.
3. **Map and social web.** The player sees the village map with walking times, and who knows whom. A "village talk" panel ranks gossip hubs by PageRank, which makes the first move obvious: talk to the barkeep.
4. **Interrogate.** The player types a question to a villager. The villager agent pulls matching claims from its own graph and answers in character, using only those claims. Each answer is saved as Statement nodes in the player's case graph and shows up as claim chips in the UI.
5. **Ask "who told you?"** Every claim a villager heard carries its source. Asking follows the chain one hop at a time. The case board draws the chain and highlights what changed at each hop, for example 21:30 becoming 22:00, or "a woman with a lantern" becoming "a man".
6. **Contradictions light up.** After every statement, the backend runs the contradiction queries. Alibi clashes, impossible travel times and changed stories appear as red edges on the case board.
7. **Time passes.** Each interrogation advances the clock and runs a gossip tick. Villagers talk about the investigation too, so the killer hears that you asked about the hammer and adjusts their story.
8. **Call the detective.** At any point the player can hand over to the detective agent. It picks tools over MCP, questions villagers, runs graph queries and posts its reasoning with every Cypher call shown.
9. **Accuse.** The player names a suspect plus motive, opportunity and evidence (statement IDs). The engine scores this against the hidden truth graph and shows the reveal: what really happened next to what the village believed.
10. **Come back tomorrow.** Sessions persist. Villagers remember earlier questions and accusations ("Last time you called me a liar"), and trust that dropped stays low.

## The demo case: Death at the Old Mill

Elena Marsh, the herbalist, killed Silas Crane at the Old Mill around 21:30 with the blacksmith's hammer, because he was about to seize her shop over a 300-crown debt. Jonas the blacksmith also lies, to hide an affair, which makes him the red herring. The game ships with this one hand-tuned case; a scenario generator (a stretch goal) can add more later.

### Cast (10 villagers you can question)

| Villager | Role | Retelling accuracy | Secret or lie | What they know first-hand |
| --- | --- | --- | --- | --- |
| Elena Marsh | Herbalist, **the killer** | Careful | Says she was at the Chapel until 22:00 | Everything; owes Silas 300 crowns |
| Jonas Reed | Blacksmith, red herring | Careful | Says he was home at the Smithy from 21:00 to 23:00; really at the Manor with Lady Wren | Was in the Tavern from 19:30 to 21:00 and argued with Silas there at 20:00 over the 40 crowns he owes him; his hammer is missing |
| Lady Wren | Lives at the Manor | Careful | Says she was alone; confirms Jonas only once trust is high | Jonas was with her 21:00 to 22:30 |
| Bess Tolley | Barkeep, gossip hub | Medium | None | Who was at the Tavern and when (Jonas 19:30 to 21:00, Hale and Imogen all evening); heard Jonas argue with Silas at 20:00 over the 40 crowns Jonas owes him; saw Jonas leave toward the Manor at 21:00 (stored as `LEFT` with `toward: manor`) |
| Pip Harlow | Village drunk | Poor (changes details often) | None | Saw "a woman with a lantern" on the Riverside path toward the Mill at 21:30 |
| Father Aldric | Priest | Very careful | None | Elena was at evening prayer but left at 21:00, not 22:00 |
| Tilly | Child, 10 | Careful, but adults trust her little | None | Saw Elena leave the Smithy at 17:30 carrying a cloth bundle while Jonas was working out back; overheard Silas tell Elena at 18:00 to pay her 300 crowns by Friday or lose her shop |
| Constable Hale | Constable | Poor with times | None | Was at the Tavern all evening and saw Jonas, Bess and Imogen there; saw Jonas argue with Silas over the 40-crown debt at 20:00; heard Pip's story first |
| Brann Holt | Miller, owns the Mill | Medium | Owes Silas 120 crowns (a second motive) | The Mill is usually locked; Silas had a spare key |
| Dr. Imogen Cole | Physician | Careful | None | Time of death 21:00 to 22:00; was at the Tavern until 22:00 and saw Jonas, Bess and Hale there |

Silas Crane, the victim, is in the graph but cannot be questioned.

### What really happened (hidden truth graph)

| Time | Event |
| --- | --- |
| 17:30 | Elena collects repaired tools from the Smithy and takes the hammer while Jonas is out back. Tilly sees her carry a bundle. |
| 18:00 | Silas tells Elena to pay by Friday or lose her shop. Tilly overhears. |
| 19:00 to 20:30 | Silas drinks at the Tavern. Jonas argues with him about a 40-crown debt at 20:00, loudly. |
| 20:30 | Silas leaves for the Mill, where Elena has offered to "settle up". |
| 21:00 | Elena leaves the Chapel. Jonas leaves the Tavern for the Manor. |
| 21:30 | Elena kills Silas at the Mill. Pip, walking home, sees a woman with a lantern on the Riverside path. |
| 22:00 | Elena is back at her shop. She later hides the hammer under her floorboards. |
| 06:00 next day | Brann finds the body. |

### The night's rumor (scripted in the template)

Pip's sighting has already travelled three hops by morning. The hops are written into `hollowmere.json` by the engine's own rules: each hop changes exactly one detail, the teller makes the change, and it fits that teller's habits. Each copy is a normal `Claim` with `HEARD_FROM`, `parent_id`, the same `root_id` and a `mutated` field, plus a `GOSSIPED` record in the truth graph (ticks −2 to 0, before the 12 pre-game ticks). Because Bess already holds the rumor, the pre-game ticks never hand her another version of it (Q2 skips rumors the listener holds), so it can't drift.

| Hop | Teller changes | Why it fits | Listener now believes |
| --- | --- | --- | --- |
| Pip → Hale | woman → man | Pip muddles details | a man with a lantern, Riverside path, 21:30 |
| Hale → Brann | 21:30 → 22:00 | Hale is poor with times | a man with a lantern, Riverside path, 22:00 |
| Brann → Bess | Riverside path → Mill | Brann owns the Mill | a man near the Mill, 22:00 |

Confidence falls at each hop (trust × 0.9): 0.54, 0.39, then 0.28 for Bess. Below 0.2, Q1 would filter it and she'd never say it, so `smoke_cypher.py` checks that Bess's copy stays at 0.2 or above.

### Village map (walking times, used for travel checks)

Eight places: the Village Square, Tavern, Smithy, Herbalist shop, Chapel, Manor, Old Mill and the Riverside path.

| Route | Minutes |
| --- | --- |
| Square to Tavern, Smithy or Herbalist shop | 5 each |
| Square to Chapel | 10 |
| Herbalist shop to Chapel | 10 |
| Square to Manor | 15 |
| Manor to Mill | 15 |
| Chapel to Riverside path | 10 |
| Riverside path to Mill | 10 |
| Tavern to Mill | 25 |
| Smithy to Mill | 30 |

Chapel to Mill along the Riverside path is 20 minutes. The path is its own place so Pip's sighting has somewhere to be, and so the Mill is a real neighbour when Brann moves the sighting there.

### The intended solving path

1. PageRank points to Bess. She repeats that Jonas argued with Silas, and that "a man was seen near the Mill at 22:00".
2. Tracing that rumor goes Bess, then Brann, then Hale, then Pip. Pip's original was "a woman with a lantern on the Riverside path at 21:30". Pip muddled the woman into a man himself when he told Hale, Hale shifted the time, and Brann moved the sighting to his Mill. Pip only says "a woman" when he's asked first-hand.
3. Adult women without a confirmed alibi at 21:30: Lady Wren and Elena. Bess's and Imogen's alibis are each confirmed by two independent eyewitnesses in the Tavern, once those witnesses have been asked.
4. Elena says she was at the Chapel until 22:00. Father Aldric says she left at 21:00, which is a contradiction. The Chapel to Mill walk is 20 minutes, so she could reach the Mill by 21:30.
5. Means and motive: Tilly saw the bundle leave the Smithy, and heard the threat about the shop.
6. Jonas's lie is explained once Lady Wren confirms the affair. His public argument was the bait.

## System architecture

Four layers: a React app, a FastAPI backend that runs every agent and the engine, an external LLM that only writes the words, and one FalkorDB instance holding 13 graphs per game.

&#91;embedded content: HEARSAY architecture · 4 layers, 13 graphs per game\]

The highlighted villager graphs are the core idea: each agent can only see its own.

**A question:** browser → villager agent → its own graph (Q1) → LLM for wording → statement written to the case graph → case service runs the contradiction queries → WebSocket event back to the browser.

**A gossip tick:** engine → reads the teller's graph (Q2) → writes the retold claim into the listener's graph → logs the hop in the truth graph.

**The detective:** calls MCP tools, which run the same villager agents and case queries the player uses. It has no direct database access, so it can never read the truth graph.

## Graph data model

Each game uses 13 FalkorDB graphs in one instance: one truth graph, one public village graph, one memory graph per villager, and one case graph for the player. Isolation is the point. A villager's agent can only query its own graph, so it can only say what it actually knows.

| Graph name | One per | Holds | Written by | Read by |
| --- | --- | --- | --- | --- |
| `game_<g>_world` | game | Hidden truth: real movements, debts, the killing, and a log of every gossip hop | Generator, gossip engine | Engine, reveal screen, "God view" (demo only) |
| `game_<g>_village` | game | Public knowledge: people, roles, map with walking times, who knows whom | Generator | Gossip engine, detective, UI |
| `game_<g>_npc_<id>` | villager | That villager's beliefs: claims, sources, trust, past conversations, cover-story rules | Gossip engine, that villager's agent | That villager's agent only |
| `game_<g>_case` | game | The player's case board: statements, claims, sources, contradictions, accusation | Backend after each answer, detective agent | Detective agent, UI |

Times are stored as `t` = minutes since midnight (21:30 = 1290). A claim covers t\_from to t\_to, so travel and window checks are plain arithmetic.

- **Point events** (a sighting, someone leaving) are stored as a 10-minute window, t−5 to t+5, never as a zero-length point. Pip's 21:30 sighting is 1285 to 1295.
- **Overlap checks are strict** (`a.t_from < b.t_to AND b.t_from < a.t_to`). "At the Tavern until 21:00" and "at the Smithy from 21:00" touch but don't overlap, so an honest villager who changes place on a slot boundary is not flagged. Because sightings have width, two sightings at the same moment still overlap.

### Villager memory graph (`game_<g>_npc_<id>`)

```cypher
(:Self {id, name, role, persona, accuracy, honesty, talkativeness, mutation_bias,
        player_trust, player_warmth})   // player_*: starting trust toward the player (Lady Wren 0.3)
(:Person {id, name})   (:Place {id, name})   (:Object {id, name})
(:Description {id, text, sex, adult, build, carrying})   // "a woman with a lantern"
(:Claim {id, root_id, parent_id, pred, subject_id, place_id, object_id, toward_id,
         t_from, t_to, confidence, origin, salience, mutated, private, crowns, note, dormant})
   // pred:   WAS_AT | LEFT | CARRIED | ARGUED_WITH | THREATENED | OWES | SAW
   // toward_id: on LEFT only, where they were heading ("left the Tavern toward the Manor")
   // origin: witnessed | heard | lie
   // crowns: on OWES; note: free text for the renderer; dormant: a rule's lie, not yet active

(:Claim)-[:ABOUT]->(:Person|:Description)
(:Claim)-[:AT]->(:Place)
(:Claim)-[:INVOLVES]->(:Object)
(:Self)-[:WITNESSED {tick}]->(:Claim)
(:Claim)-[:HEARD_FROM {tick}]->(:Person)
(:Self)-[:TRUSTS {score, warmth}]->(:Person)               // semantic memory
(:Self)-[:HAD]->(:Conversation {player_id, session, tick})  // episodic memory
(:Conversation)-[:INCLUDED]->(:Question {text, tick})-[:ANSWERED_WITH]->(:Claim)
(:Rule {id, trigger, action, active, subject_id, t_from, t_to, topic, asked_of,
        hides, uses, supersedes, stretch})-[:USES]->(:Claim)    // procedural memory (liars)
   // uses: the USES claim ids as a list too, so Q1 can tell the rule's own lie from what it covers
   // Description ids follow d_<man|woman|boy|girl>[_<carrying>], so the engine can blur names without a lookup
   // trigger: asked_whereabouts | heard_detective_asked; action: replace | plant
   // hides: ids of the true claims the lie replaces; supersedes: the rule this one switches off
(:Gate {id, min_trust, cite_pred, cite_subject_id, cite_toward_id, refusal})-[:GUARDS]->(:Claim)
   // trust gate: guarded claims are shared only at player trust >= min_trust, or when the player
   // cites a statement asserting a claim with cite_pred / cite_subject_id / cite_toward_id
```

**Lady Wren's gate** is a `Gate` guarding her two claims that Jonas was at the Manor: `min_trust 0.6`, or a cited `LEFT {subject: jonas, toward: manor}`. Until then the agent answers with `refusal` ("I was alone at the Manor all evening.").

**Rules have one switch.** The lie claim behind a rule that hasn't fired (Elena's stretch rules) is stored with `confidence: 0, dormant: true`, so Q1 and Q2 skip it. Rules are only activated with `w02_activate_rule`, which sets `Rule.active`, raises its claims to confidence 1 and switches off the rule it supersedes, all in one statement. Agents check `Rule.active`, never the claim.

### Village graph (`game_<g>_village`, public)

```cypher
(:Person {id, name, role, sex, adult, build})   // adult: "a woman" never matches Tilly
(:Place {id, name})
(:Place)-[:ROAD {minutes}]->(:Place)            // stored in both directions
(:Person)-[:KNOWS {closeness}]->(:Person)       // gossip only flows along these
(:Person)-[:LIVES_AT|WORKS_AT]->(:Place)
(:Fact {id, text})                              // "Body found at the Old Mill, 06:00"
```

### Truth graph (`game_<g>_world`, hidden)

```cypher
(:Person {..., is_victim, is_killer})   (:Place)   (:Object {id, name})
(:Person)-[:WAS_AT {from_t, to_t}]->(:Place)
(:Person)-[:OWES {crowns}]->(:Person)
(:Person)-[:THREATENED {t}]->(:Person)
(:Person)-[:TOOK {t}]->(:Object)
(:Person)-[:KILLED {t, weapon}]->(:Person)
(:Person)-[:GOSSIPED {tick, root_id, claim_id, mutated_field, before, after}]->(:Person)
```

### Case graph (`game_<g>_case`)

```cypher
// seeded with the public Person, Place and ROAD data so travel checks run here; Person gets alibi_confirmed (set from Q13, only for the time of death)
(:Statement {id, text, session, tick})-[:SAID_BY]->(:Person)
(:Statement)-[:ASSERTS]->(:Claim {id, root_id, pred, subject_id, place_id, object_id, toward_id, t_from, t_to, teller_id, reported_as})
   // reported_as: saw | heard   (a liar's cover story is reported as 'saw')
(:Claim)-[:ABOUT]->(:Person|:Description)
(:Claim)-[:AT]->(:Place)
(:Claim)-[:SOURCED_FROM]->(:Person)        // "I heard it from Hale"
(:Claim)-[:DERIVED_FROM]->(:Claim)         // backend links it when the source asserts a claim with the same root_id
(:Description)-[:FITS]->(:Person)          // computed from public sex, adult and build
(:Contradiction {key, kind, claim_1, claim_2, detail, tick})-[:INVOLVES]->(:Statement)
   // key = kind + the two claim ids, sorted
(:Contradiction)-[:IMPLICATES {root_id}]->(:Person)  // whose story is in doubt (rule below); may be absent
(:Accusation {suspect_id, motive, tick})-[:CITES]->(:Statement)
```

**Contradictions are stored once.** Q6a, Q6b and Q11 run after every answer and return every clash found so far, not just new ones. Each returns the two claim IDs and the two statement IDs. The backend stores each row with `MERGE` on `key`, so running the check again changes nothing. Without this, Elena's one lie would become five lies by the fifth question and Q14's ranking would drift. The key uses claim IDs, not statement IDs, because one answer can assert several claims, and two different clashes from the same pair of answers must stay separate.

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

Rows where `new` is true send a `contradiction_found` event.

**Who a contradiction implicates.** `INVOLVES` links both statements, so it cannot be used to blame anyone: the witness who caught a lie is in it too. "Backing" is Q8a's count: distinct other people who report the same thing first-hand.

- **Q6b** (said they stayed, someone saw them leave): if the stay claim is the person talking about themselves, implicate them. Otherwise use the Q6a rule. Backing can't decide this one, because the witness's own "was at the Chapel until 21:00" counts as backing for Elena's "until 22:00".
- **Q6a** (two places at once): implicate the teller whose claim has less backing. On a tie, if exactly one side is a person talking about their own whereabouts, implicate them; otherwise implicate nobody and leave it as an open lead.
- **Q11** (a story changed between questions): implicate the villager who changed it, and store the `root_id` of the **earlier, abandoned** claim. A confession is a story change too: when Jonas admits to the Manor, the lie is still the Smithy story, which already counts as a lie through Q6a, so it is not counted twice.

The edge stores the `root_id` of the implicated person's claim, so Q14 counts a lie repeated in a second session, caught by three witnesses, or later abandoned, as one lie.

**`IMPLICATES` is recomputed on every check.** Backing changes as more villagers talk: a tie broken by the self-claim rule can stop being a tie once that person's claim gains a witness. So after each answer the backend deletes every `IMPLICATES` edge and applies the rule again to all contradictions, using `claim_1` and `claim_2`. A game has a few dozen contradictions at most, so this is cheap.

**`root_id` stays on the backend.** It is how the backend knows two claims are the same rumor, so it uses it to create `DERIVED_FROM` links. It is stripped from every MCP tool result and API response, so neither the detective nor the player can group rumors without asking villagers.

The detective never reads the truth graph. It only sees what villagers said to it, which is what keeps the game fair.

## Gossip and distortion engine

Gossip is plain Python with a seeded random generator, not the LLM. The same seed always produces the same village, which keeps the demo reproducible and every rumor explainable.

**One tick = 30 in-game minutes.** The engine runs 12 ticks before the player arrives, so rumors have already travelled by the morning. Each interrogation then runs one more tick. Because the same seed always gives the same village, `seed.py` runs the 12 pre-game ticks once on the templates (with `GAME_SEED`) and every game copies the result, so `POST /games` only copies 13 graphs. The tick counter and seed live in a `(:Clock {tick, seed})` node in the truth graph. On FalkorDB Cloud a tick takes about 3 seconds; locally about 0.1.

**What happens in one tick:**

1. Villagers take turns in seeded random order. Villager A talks to B along each `KNOWS` edge when `rng < closeness × A.talkativeness`.
2. A picks up to 2 claims from its own graph, ranked by `salience × confidence` (query Q2), skipping any rumor B already holds (same `root_id`).
3. The claim is copied into B's graph with `origin: 'heard'`, a `HEARD_FROM` edge to A, the same `root_id`, and `confidence = parent × trust(B→A) × 0.9`.
4. With probability `1 − A.accuracy`, one detail changes on the way (table below).
5. The hop is logged in the truth graph as `(A)-[:GOSSIPED {before, after}]->(B)`, which drives the reveal screen.
6. Claims under 0.2 confidence are never retold. That is how the village forgets.

**Plan, then write.** A tick has two phases, and only the first one touches the random generator:

1. **Plan (sequential).** Read each villager's graph once at the start of the tick. Walk villagers in seeded order and make every random draw (who talks, which claims, which detail mutates), producing a list of hops. A villager only retells claims it held when the tick began, so a rumor moves at most one hop per tick and the plan never depends on a write from the same tick.
2. **Write (parallel).** Apply the hops with `asyncio`, one task per listener graph, then log them to the truth graph.

If the random draws happened inside parallel tasks, the order they ran in would change the outcome, and the same seed would give a different village. Because every interrogation also runs a tick, `replay_demo.py` has to ask its questions in a fixed order too.

**IDs come from the seed too.** A random `uid()` would give every claim a new ID on each run, so replays and the IDs shown in the video would never match. `seeded_id` is `uuid5` of the seed (not the game ID, so two games from one seed are identical), tick, teller, listener, rumor and parent claim, and the same scheme is used for statements and case claims. The parent claim is needed because a teller can hold two versions of the same rumor, and both retellings in one tick would otherwise get the same ID.

| Detail | How it changes | Who changes it most |
| --- | --- | --- |
| Time | Shifts 30 minutes earlier or later | Constable Hale |
| Place | Becomes a neighbouring place on the map | Pip |
| Person | A name becomes a description, or a description changes one attribute ("woman" to "man") | Pip, Bess |
| Certainty | "Saw" turns into "someone said" (confidence drops) | Everyone |

```python
def retell(claim, teller, listener, rng):
    new = claim.copy(id=seeded_id(game, tick, teller, listener, claim.root_id, claim.id),
                     parent_id=claim.id, origin="heard")
    new.confidence = claim.confidence * trust(listener, teller) * 0.9
    if rng.random() > teller.accuracy:
        field = rng.choice(teller.mutation_bias)          # e.g. ["t", "t", "place"] for Hale
        if field == "t":       d = rng.choice([-30, 30]); new.t_from += d; new.t_to += d
        if field == "place":   new.place_id = rng.choice(neighbours(claim.place_id))
        if field == "subject": new.subject_id = blur_or_shift(claim.subject_id, rng)
        new.mutated = field
    write_claim(graph_of(listener), new, heard_from=teller.id)
    log_hop(world, teller, listener, claim, new)
```

**Liars.** Elena and Jonas each have `Rule` nodes in their memory graphs. When a question touches the topic a rule covers (their location from 21:00 to 22:00), they answer with the rule's lie claim instead of the truth. Elena never retells a claim that incriminates her (those claims are `private`). A rule switches on only through `w02_activate_rule` (see the villager memory graph).

**The killer reacts.** When the player asks about something (the hammer, the Mill, 21:30), the villager being questioned stores "the detective asked about the hammer" as a high-salience claim, and it spreads like any other gossip. When it reaches Elena, two more rules can switch on:

- **Frame Jonas.** On hearing the detective asked about the hammer, she plants a new lie: she saw Jonas carrying his hammer toward the Mill at 20:45. That lie has no witness chain behind it, so Q8b lists it as an uncorroborated lead. At 20:45 Jonas was in the Tavern in front of several witnesses, so once any of them is asked, Q6a turns it into a contradiction that implicates Elena.
- **Change her story.** On hearing the detective asked Father Aldric when she left the Chapel, she switches from "at the Chapel until 22:00" to "I left at 21:00 and went home" (Herbalist shop from 21:10 to 22:00). Her new claim overlaps the old one at a different place, so Q11 fires and implicates her.

## Agents

There are 10 villager agents and 1 detective agent, plus the non-LLM engine. The LLM never decides facts. It only puts graph facts into words, and every word has to trace back to a claim ID.

### Villager agent: one question, start to finish

1. **Parse.** A short LLM call (or keyword matching against the known names, places and times) turns the question into `{intent, person_ids, place_ids, time_window}`. The intents are `whereabouts`, `saw_who`, `who_told_you`, `motive`, `object` and `general`.
2. **Retrieve.** The intent picks a fixed Cypher template, which runs on this villager's own graph only (Q1, Q3). The agent also loads its last 3 conversations with this player (Q9) and its trust toward the player.
3. **Apply rules.** If an active `Rule` matches the topic (a liar's cover story), the lie claim replaces the true one.
4. **Gate by trust.** Sensitive claims are only shared when trust is high enough. Lady Wren confirms the affair only at trust 0.6 or above, or when the player cites a statement asserting `LEFT {subject: jonas, toward: manor}`, which is Bess's "he left the Tavern toward the Manor at 21:00".
5. **Render.** The LLM receives a persona card, the claims as JSON with their IDs, and the episodic memory. It returns `{dialogue, claim_ids_used, emotion}`.
6. **Guardrail.** The backend checks that every name, place and time in the dialogue appears in the claims used. On failure it retries once with a stricter prompt, then falls back to a template sentence. This is what stops hallucinated clues.
7. **Write back.** The Question and Conversation go into the villager's graph; the Statement and its Claims go into the case graph. Trust toward the player drops if the question was accusatory.
8. **Check.** The contradiction queries run (Q6a, Q6b, Q11), each contradiction is merged on its key, new ones get their `IMPLICATES` edge, and the leads list (Q8b) is refreshed. New results are pushed to the UI over WebSocket.

**Replay mode.** The LLM is the only part of this loop that can vary between runs: the intent parser could pick a different query template, and the renderer could cite different claim IDs. With `REPLAY=1`, step 1 uses the keyword parser and step 5 uses the template sentences, so `replay_demo.py` gets the same statements and claims every time. The LLM still writes the dialogue in normal play.

```text
PERSONA: You are Father Aldric, the village priest. Calm, precise, never gossips for fun.
MOOD toward this detective: trust 0.7, warmth 0.5
YOU REMEMBER: Session 1, they asked about Elena. You answered C-114.
FACTS YOU MAY USE (use only these, cite their ids):
  C-114 {pred: WAS_AT, who: Elena, place: Chapel, from: 19:00, to: 21:00, origin: witnessed}
  C-121 {pred: LEFT, who: Elena, place: Chapel, t: 21:00, origin: witnessed}
QUESTION: "Was Elena at prayer all evening?"
Return JSON: {"dialogue": "...", "claim_ids_used": ["..."], "emotion": "..."}
```

### Detective agent

The detective is a tool-calling LLM in a plan, act, observe loop, capped at 12 steps. It connects to our own MCP server, `hearsay-graph` (Python FastMCP), and chooses tools from it. The tools only reach the village and case graphs, never the truth graph, so the detective cannot cheat.

| MCP tool | What it does | Query |
| --- | --- | --- |
| `village_overview()` | People, roles, map, who knows whom | Village graph |
| `gossip_hubs(top_k)` | Ranks villagers by how much gossip flows to them | Q4 (PageRank) |
| `factions()` | Groups villagers into social circles | Q5 (CDLP) |
| `interrogate(villager_id, question)` | Runs the villager agent loop; costs 30 in-game minutes | Writes to the case graph |
| `trace_rumor(claim_id)` | Follows a claim back to its origin; returns the next villager to ask if the chain is open | Q7 |
| `find_contradictions()` | Alibi clashes and changed stories, with who each one implicates | Q6a, Q6b, Q11 |
| `uncorroborated_leads()` | Eyewitness claims nobody else backs up; leads, not proof | Q8b |
| `check_travel(person, from, from_t, to, to_t)` | Could this person get there in time? | Q10 (weighted shortest path) |
| `suspects_fitting(description_id, t)` | Who matches a description and has no confirmed alibi then; runs Q13 for each match first | Q13, then Q12 |
| `alibi_independence(person_id, t)` | Are the confirmations really from different sources? | Q13 |
| `score_suspects()` | Motive, means, opportunity and lies per suspect | Q14 |
| `accuse(suspect_id, motive, statement_ids)` | The final action, scored against the truth | Engine |

Tool results never include `root_id` (see the case graph section), so the detective has to trace rumors by asking, just like the player.

The UI shows every tool call with its Cypher in a side panel. The detective ends with a case report in which each claim cites statement IDs and a graph path.

**Handoff between player and detective.** Both work on the same case graph. When the player hands over, the detective reads what is already on the board instead of starting again. When it stops, it writes a `(:Handoff {summary, open_leads})` node that the player sees on return.

## Memory across sessions

Everything a villager knows, believes or remembers about the player lives in that villager's FalkorDB graph, so closing the browser loses nothing. Coming back loads the same `game_<g>_*` graphs.

| Memory type | Where it lives | Example | When it changes |
| --- | --- | --- | --- |
| Episodic | `Conversation` and `Question` nodes in the villager's graph | "You asked me about Elena yesterday, and you didn't like my answer." | Every question |
| Semantic | `Claim` nodes and `TRUSTS` edges | Brann believes the sighting was at 22:00; his trust in the player is 0.5 | Every gossip tick and every answer |
| Procedural | `Rule` nodes | Elena's cover story, and her rule to frame Jonas | When the rumor that triggers a rule arrives |
| Shared state | Village graph and case graph | Player and detective work on the same case board | Continuously |

**One village per player.** A new game copies the template graphs (`tpl_world`, `tpl_village`, `tpl_npc_<id>`, `tpl_case`) to `game_<g>_*` with FalkorDB's `GRAPH.COPY`. In the Python client this is `db.select_graph("tpl_world").copy("game_42_world")`. The copy includes indexes, and the template stays usable while it runs ([GRAPH.COPY docs](https://docs.falkordb.com/commands/graph.copy)).

**Sessions.** The game ID is stored in the browser. Each return increases `session` on the case graph, so villagers can tell a new visit from a follow-up question.

**Concurrent writes.** In a gossip tick, each listener's new claims go to a different graph, so once the tick is planned (see "Plan, then write") the engine writes to all villagers in parallel with `asyncio`. A per-graph lock keeps writes to the same villager in order, including a gossip write and an interrogation write landing at once. This is the story for "high-concurrency reads and writes": 10 agents writing at once, with no contention between their graphs, and the same seed still produces the same village.

## Core Cypher queries

These queries (Q1 to Q14, plus Q1b) are the product, and they go into the README as rule 10 requires. Algorithm syntax was checked against the FalkorDB docs ([PageRank](https://docs.falkordb.com/algorithms/pagerank), [CDLP](https://docs.falkordb.com/algorithms/cdlp), [SPpaths](https://docs.falkordb.com/algorithms/sppath)). Test each one in FalkorDB Browser on the demo case before wiring it into code.

**Two FalkorDB rules to remember.** It has no label expressions in `MATCH`, so `(:Person|:Description)` in the schema is notation only: queries leave that end unlabeled. And when a pattern's relationship is not referenced anywhere else, FalkorDB only checks that one exists, so name the relationship when you need to count every match ([known limitations](https://docs.falkordb.com/cypher/known-limitations)).

### Setup

```python
from falkordb import FalkorDB
db = FalkorDB(host="localhost", port=6379)
case = db.select_graph(f"game_{gid}_case")
rows = case.query(Q10, {"from_place": "chapel", "to_place": "mill", "from_t": 1260, "to_t": 1290}).result_set
```

```cypher
CREATE INDEX FOR (c:Claim) ON (c.id)
CREATE INDEX FOR (c:Claim) ON (c.root_id)
CREATE INDEX FOR (p:Person) ON (p.id)
CREATE INDEX FOR (pl:Place) ON (pl.id)
CREATE INDEX FOR (s:Statement) ON (s.id)
CREATE INDEX FOR (x:Contradiction) ON (x.key)
```

**A third rule, found by `smoke_cypher.py` on FalkorDB 4.x.** When two comma-separated patterns are filtered by a `WHERE` that compares them, and a later `MATCH` reuses their nodes, FalkorDB drops the pairing inside each pattern: Q6b returned Bess's statement joined to Aldric's claim. A `WITH` straight after the `WHERE` fixes it, so Q6a and Q6b have one. Any new query with that shape needs one too, plus a smoke-test case.

**Two more, found while building the case writer.** An inline property map can't refer to another matched node: `MATCH (c1:Claim {id: x.claim_1})` fails with "Variable x not found" (an `UNWIND` variable works). Use `WHERE c1.id = x.claim_1` with a `WITH` barrier. And after an `OPTIONAL MATCH` plus aggregation, a later `OPTIONAL MATCH` anchored on the aggregated node that filters its other end (`{id: $sighting}` or `WHERE d.id = $sighting`) matches nothing, which zeroed Q14's fit term. Q14 collects the descriptions a person fits and tests membership instead, and the smoke test checks it.

### Villager memory graphs

**Q1. What do I believe about this person in this window?** Used by the villager agent for every whereabouts question.

```cypher
MATCH (c:Claim)-[:ABOUT]->(x {id: $person})
WHERE c.t_from <= $t_to AND c.t_to >= $t_from AND c.confidence >= 0.2
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

An active rule covers its topic: claims it `hides`, plus every other claim about its subject inside its window (gossip the liar has heard about herself), except its own lie, are dropped before `LIMIT`. Elena has six claims about 21:00 to 22:00, so filtering after the query could cut her lie and leave the truth; `smoke_cypher.py` checks she gives only the cover story, and only the new lie once `w02` switches on her changed story. `claim_id` breaks ties so `REPLAY=1` always gets the same five.

**Q1b. What do I believe happened at this place in this window?** Q1 is keyed on a person, but a sighting is about a `Description` at a place, so "Did anyone see anything at the Mill?" needs this one. It is how Bess finds "a man near the Mill".

```cypher
MATCH (c:Claim)-[:AT]->(pl:Place {id: $place})
WHERE c.t_from <= $t_to AND c.t_to >= $t_from AND c.confidence >= 0.2
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

**Q2. What will I gossip about next?** Used by the engine each tick. `$listener_roots` is the list of rumors the listener already holds.

```cypher
MATCH (c:Claim)
WHERE c.confidence >= 0.2 AND coalesce(c.private, false) = false AND NOT c.root_id IN $listener_roots
RETURN c
ORDER BY c.salience * c.confidence DESC, c.id   // tie-break, or equal scores come back in an order the seed doesn't control
LIMIT 2
```

**Q3. Who told me?** Answers "who told you that?" and builds the case graph's `SOURCED_FROM` edge.

```cypher
MATCH (c:Claim {id: $claim_id})-[h:HEARD_FROM]->(src:Person)
RETURN src.id AS source_id, src.name AS source, h.tick AS tick
```

**Q9. What has this player asked me before?** Episodic memory for the persona prompt.

```cypher
MATCH (:Self)-[:HAD]->(conv:Conversation {player_id: $player})-[:INCLUDED]->(q:Question)
OPTIONAL MATCH (q)-[a:ANSWERED_WITH]->(c:Claim)
RETURN conv.session AS session, q.tick AS tick, q.text AS asked, collect(c.id) AS answered_with
ORDER BY tick DESC
LIMIT 3
```

### Village graph

**Q4. Who hears the most gossip?** PageRank over `KNOWS`. Most `KNOWS` edges are stored in both directions, so in practice this ranks the best-connected villagers, the people who hear the most rumors. Bess comes out on top because she knows nearly everyone.

```cypher
CALL algo.pageRank('Person', 'KNOWS') YIELD node, score
RETURN node.name AS villager, score
ORDER BY score DESC
LIMIT 3
```

**Q5. Which circles cover for each other?** Community detection by label propagation. Results can vary slightly between runs, so compute it once per game and cache it.

```cypher
CALL algo.labelPropagation({nodeLabels: ['Person'], relationshipTypes: ['KNOWS']})
YIELD node, communityId
RETURN communityId, collect(node.name) AS circle
ORDER BY size(circle) DESC
```

### Case graph

**First-hand only.** The contradiction queries (Q6a, Q6b, Q11) compare only claims reported as `saw`: what someone witnessed, or says about their own whereabouts. Gossip moves times and places on purpose, so comparing heard versions would fill the board with red edges that mean nothing. Differences between heard versions belong in the rumor trace (Q7).

**Q6a. Same person, two places at once.** This catches two lies in the demo case:

- **Jonas's cover story.** He says the Smithy from 21:00 to 23:00; Lady Wren says the Manor from 21:00 to 22:30. Neither claim has backing, and his is about himself, so Jonas is implicated.
- **Elena's planted lie** (stretch: killer reacts). She says she saw Jonas heading to the Mill with his hammer at 20:45, stored as `WAS_AT {subject: jonas, place: mill, t_from: 1240, t_to: 1250}`. At 20:45 Jonas was in the Tavern in front of Bess, Hale and Imogen. Their claim has backing and hers has none, so Elena is implicated. The lie is set at 20:45 on purpose: at 21:15 it would tie with Lady Wren's claim and clash with Jonas's own cover story, and the self-claim rule would implicate Jonas, so the killer's move would make the red herring look guiltier. At least two Tavern witnesses have to have been asked about Jonas first, because Q6a and Q8a only see what villagers have said. With only one on record, both sides have zero backing, it's a tie, and nobody is implicated.

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

**Q6b. Claims to have stayed, but someone saw them leave.** This catches Elena: she says Chapel until 22:00, and Father Aldric says she left at 21:00. The backend implicates Elena, not the priest, because her claim is about herself. The whole leaving window has to fall inside the stay, so an honest "I stayed until 21:00" next to "saw them leave at 21:00" (20:55 to 21:05) is not a clash.

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

**Q7. Trace a rumor to its origin.** Python compares consecutive hops to highlight what changed. If the furthest hop was "heard", Q3's `SOURCED_FROM` names the next villager to question.

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

**Backing** means distinct other people who report the same thing first-hand: same predicate, person, place and an overlapping time. Three things must not count:

- **The same teller.** Elena repeating her lie in session 2 does not back it.
- **Heard copies.** Once a lie spreads, Bess's retelling is the same rumor, not a second witness.
- **A different predicate.** Elena's "at the Chapel until 22:00" must not back Father Aldric's "left the Chapel at 21:00"; it contradicts it.

**Q8a. How many people back this claim?** Used by the `IMPLICATES` rule for any claim, including someone's claim about themselves.

```cypher
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {id: $claim_id}), (s)-[:SAID_BY]->(teller:Person)
OPTIONAL MATCH (s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'}), (s2)-[:SAID_BY]->(t2:Person)
WHERE t2.id <> teller.id AND c2.pred = c.pred AND c2.subject_id = c.subject_id
  AND c2.place_id = c.place_id AND c2.t_from < c.t_to AND c.t_from < c2.t_to
RETURN count(DISTINCT t2) AS backing
```

**Q8b. Eyewitness claims nobody else backs up.** These are **leads, not contradictions**, and the UI shows them in their own list, never as red edges. Honest sole witnesses land here too (Tilly's bundle, Pip's original sighting, Father Aldric's "left at 21:00"), so zero backing means "worth checking", not "lying". Elena's planted lie shows up here first, and Q6a turns it into a contradiction once a Tavern witness places Jonas there at 20:45.

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

**Q10. Could they get there in time?** Weighted shortest path over the map. Chapel at 21:00 to the Mill at 21:30 needs 20 minutes and has 30, so it is possible.

```cypher
MATCH (a:Place {id: $from_place}), (b:Place {id: $to_place})
CALL algo.SPpaths({sourceNode: a, targetNode: b, relTypes: ['ROAD'],
                   weightProp: 'minutes', relDirection: 'outgoing'})
YIELD path, pathWeight
RETURN pathWeight AS minutes_needed, $to_t - $from_t AS minutes_available,
       pathWeight <= $to_t - $from_t AS possible, [n IN nodes(path) | n.name] AS route
```

**Q11. Stories that changed between questions.** First-hand claims only. A villager can honestly pick up a new version of a rumor between two questions, but what they saw themselves never changes, so a change here means one of the two versions was a lie: either a new lie, or a confession that abandons an old one. Either way the lie counted is the earlier claim (`claim_1`). In the demo case it fires when Elena switches to "I left at 21:00 and went home" (see "The killer reacts"), which is a stretch feature, and when Jonas admits to the Manor. Q6a skips pairs from the same teller, so a changed story is caught here only, not twice.

```cypher
MATCH (n:Person)<-[:SAID_BY]-(s1:Statement)-[:ASSERTS]->(c1:Claim {reported_as: 'saw'}),
      (n)<-[:SAID_BY]-(s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'})
WHERE s1.tick < s2.tick AND c1.pred = c2.pred AND c1.subject_id = c2.subject_id
  AND c1.t_from < c2.t_to AND c2.t_from < c1.t_to AND c1.place_id <> c2.place_id
RETURN n.name AS villager, c1.subject_id AS about, c1.place_id AS first_said,
       s1.session AS session_1, c2.place_id AS later_said, s2.session AS session_2,
       s1.id AS stmt_1, s2.id AS stmt_2, c1.id AS claim_1, c2.id AS claim_2
```

**Q12. Who fits the description and has no confirmed alibi?** With "a woman with a lantern" at 21:30, this returns Elena and Lady Wren, but only if two things happen first:

- **Run Q13 for everyone who fits, before Q12.** `alibi_confirmed` is only set when Q13 runs for that person, so otherwise Bess and Imogen come back as unconfirmed. The `suspects_fitting` tool does this itself.
- **The alibis have to be on the record.** Q13 can only confirm what villagers have said. Bess's alibi needs Hale and Imogen to have placed her in the Tavern, and Imogen's needs Bess and Hale. `replay_demo.py` asks those questions before calling Q12.

Tilly is excluded by the `adult` flag on the description match.

```cypher
MATCH (d:Description {id: $description_id})-[:FITS]->(p:Person)
WHERE p.alibi_confirmed IS NULL OR p.alibi_confirmed = false
RETURN p.id AS suspect_id, p.name AS suspect
```

**Q13. Is this alibi really confirmed by independent sources?** Every confirmation is followed back to its origin, and **only eyewitness origins count**. Three people repeating one sighting count as one source once the chain is traced. A heard claim that has not been traced back to an eyewitness is returned as unverified, not counted: before tracing, `SOURCED_FROM` only names the last teller, and counting that would let a relayed rumor pass as a second witness. Two or more distinct eyewitnesses confirm the alibi. Imogen's alibi (Bess and Hale both saw her at the Tavern) is confirmed once Bess and Hale have been asked about her.

**Only the time of death writes the flag.** `alibi_confirmed` is a single flag on `Person`, and Q12 and Q14 read it as "alibi for the murder". So the backend only writes it when `$t` is the time of death (21:30, from the case file). The detective can call `alibi_independence` for any other time, such as 20:00, and gets the result back, but nothing is stored, so it can't overwrite the 21:30 answer.

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

`collect` skips nulls, so each list only holds its own kind. The detective's next move for anything in `unverified` is "who told you?".

**Q14. Rank the suspects.** Motive, means, lies, fit to the scene sighting and alibi in one score. The weights are a starting point to tune on the demo case.

- **Lies** count contradictions linked to the person by `IMPLICATES`, not every contradiction they took part in. Counting `INVOLVES` would give Father Aldric a lie for catching Elena. Each lie counts once (distinct `root_id` on the edge), even when three witnesses catch it or it is repeated in a second session.
- **Fits** adds opportunity: does the person match the description of the sighting at the scene (`$sighting`, the traced "woman with a lantern")? Without it, Elena and Jonas tie: both have two motive claims, both were at the Smithy before the murder, and both have one lie. Once the player traces the rumor back to Pip, Jonas, a man, drops out.

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
OPTIONAL MATCH (:Description {id: $sighting})-[f:FITS]->(p)
WITH p, motive, means, lies, count(f) AS fits
RETURN p.name AS suspect, motive, means, lies, fits, coalesce(p.alibi_confirmed, false) AS alibi,
       motive * 2 + CASE WHEN means > 0 THEN 3 ELSE 0 END + lies * 2 + fits * 3
         - CASE WHEN coalesce(p.alibi_confirmed, false) THEN 5 ELSE 0 END AS score
ORDER BY score DESC
```

On the intended path this gives Elena 12 (motive 4, means 3, one lie 2, fits 3) and Jonas 9 (motive 4, means 3, one lie 2). Lady Wren fits the description but has no motive or means. `smoke_cypher.py` should assert this order. Two of those points depend on claims that must be in `hollowmere.json`: Tilly overhearing that Elena owes Silas 300 crowns (Elena's second motive), and Tilly seeing Jonas working at the Smithy at 17:30 (Jonas's means; his cover story ends after the time of death, so it doesn't count). Without them it is Elena 10, Jonas 6: the right order, but a thinner margin. Jonas's motive 4 also needs the Tavern witnesses to state both the 20:00 argument and the 40 crowns he owes Silas (see the cast table). With the stretch "killer reacts" rules, Elena's planted lie adds one more lie. Her changed story does not: Q11 stores the root of her abandoned Chapel story, which is already counted. That puts her at 14 against Jonas's 9.

`$sighting` is the description of the scene sighting the player currently holds. While it is Bess's "a man near the Mill", Jonas gets the fit points and leads, 12 to 9. Once the trace turns it into Pip's "a woman with a lantern", Elena leads, 12 to 9. Those numbers only appear once the motive, means and lie claims are on the record, which takes about 8 of the 16 questions (see the demo script). That flip is the clearest proof in the demo that the graph is doing the work.

## API and frontend screens

One FastAPI backend serves the game. Long answers (villager dialogue, detective steps) stream over SSE, and graph events go out over one WebSocket per game.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/games` | New game: copies the template graphs (already 12 gossip ticks in), returns `game_id` |
| GET | `/games/{g}` | Clock, interrogations left, session number |
| GET | `/games/{g}/village` | People, map, who knows whom, gossip hubs (Q4), circles (Q5) |
| POST | `/games/{g}/ask` | `{villager_id, question}`: streams the answer, returns statement and claim IDs |
| POST | `/games/{g}/claims/{claim_id}/source` | The "who told you?" button (Q3) |
| GET | `/games/{g}/case` | Case graph nodes and edges for the board |
| GET | `/games/{g}/contradictions` | Contradictions from Q6a, Q6b and Q11 with who each implicates, plus the leads list from Q8b |
| GET | `/games/{g}/trace/{claim_id}` | Rumor chain with the change at each hop (Q7) |
| POST | `/games/{g}/detective` | Runs the detective; streams each tool call and its Cypher |
| POST | `/games/{g}/accuse` | `{suspect_id, motive, statement_ids}`: scores against the truth |
| GET | `/games/{g}/reveal` | Truth next to belief, available only after an accusation |
| WS | `/games/{g}/events` | `contradiction_found`, `rumor_spread`, `clock_tick`, `mood_changed` |

### Screens

1. **Village.** A map of the 8 places with each villager's portrait where they are now, the social web as an overlay, and a "hears everything" badge on the top PageRank villager.
2. **Interrogation.** Chat with one villager. Each answer shows its claims as chips; heard claims get a "Who told you?" button. A trust meter shows how open the villager is.
3. **Case board.** A force-directed graph of the case graph, with contradictions as red edges. Under it, a timeline strip from 18:00 to 24:00 shows where each person claims to have been; gaps are missing alibis.
4. **Rumor trace.** A row of portraits, one per hop, with the claim under each and the changed detail highlighted (woman to man, 21:30 to 22:00, Riverside path to Mill).
5. **Detective panel.** Streams the agent's steps: tool name, collapsible Cypher, and a one-line result.
6. **Accusation and reveal.** Pick suspect, motive and evidence. The reveal puts what happened beside what the village believed, and replays the gossip hops from the truth graph.

A demo-only **God view** toggle shows every villager's memory graph side by side. It is the best 10 seconds of the video, and it is hidden in normal play.

## Tech stack and repo structure

Python on the backend, because it has FalkorDB's official client and the MCP SDK; React on the front. Every query lives in its own `.cypher` file, so the README can list them directly.

| Layer | Choice | Why |
| --- | --- | --- |
| Graph database | FalkorDB: Docker locally, FalkorDB Cloud for the live demo | Required; one graph per villager; built-in algorithms |
| Backend | Python 3.11, FastAPI, `falkordb` client, `asyncio` | Official client, fast to write, async for parallel gossip |
| MCP | Python MCP SDK (FastMCP), server name `hearsay-graph` | Track 1 asks for tool selection through MCP |
| LLM | One fast model with JSON output and tool calling, set in `.env` | Free tiers are enough; swappable |
| Frontend | React, Vite, TypeScript, Tailwind; `react-force-graph-2d` for the case board; plain SVG for the map | Quick to build, looks good on video |
| Deployment | Frontend on Vercel, backend on Render or Railway, FalkorDB Cloud | Gives the live link rule 10 asks for |
| Local fallback | `docker compose up` for FalkorDB, backend and frontend | Rule 10's local setup option |

```text
hearsay/
├── docker-compose.yml
├── README.md                 # setup, graph model, every Cypher query, AI-assistant disclosure
├── backend/
│   ├── app/main.py           # FastAPI routes, SSE, WebSocket
│   ├── app/db.py             # FalkorDB client, graph names, GRAPH.COPY per game
│   ├── app/queries/          # q01_recall.cypher ... q14_rank_suspects.cypher
│   ├── app/scenario/         # hollowmere.json and the loader for tpl_* graphs
│   ├── app/engine/           # clock, gossip ticks, retelling, mutation, liar rules
│   ├── app/npc/              # villager agent: parse, retrieve, render, guardrail, write back
│   ├── app/case/             # statement writer, contradiction checks, alibi confirmation
│   ├── app/detective/        # detective agent loop (MCP client)
│   └── mcp_server/server.py  # FastMCP tools wrapping the village and case queries
├── frontend/src/
│   ├── pages/                # Village, Interrogate, CaseBoard, Trace, Detective, Reveal
│   └── components/
└── scripts/
    ├── seed.py               # builds the tpl_* graphs from the scenario JSON
    ├── smoke_cypher.py       # runs all 14 queries on the demo case and checks the answers
    └── replay_demo.py        # plays the intended solving path end to end
```

`replay_demo.py` is the safety net. If it passes, the demo works. Run it before every deploy.

## Team roles and 4-day plan

Three owners, one per layer, so nobody waits on anybody after day 1. The hard rule: a full manual solve must be playable by Friday night, and everything after that is polish and the detective.

| Role | Owns | First task tonight |
| --- | --- | --- |
| Graph and engine | Scenario JSON, `seed.py`, schema, gossip engine, all 14 queries, `smoke_cypher.py`, `replay_demo.py` | Write `hollowmere.json` from the demo case above and load it into FalkorDB |
| Agents | Villager agent loop, persona prompts, guardrail, trust gating, MCP server, detective agent | LLM wrapper, then Father Aldric answering from Q1 in a terminal |
| Frontend and demo | All screens, graph views, SSE and WebSocket wiring, deployment, demo video, blog post | Vite app with the village map and a chat panel on mock data |

If you fill the 4th seat, give them the scenario writing, testing against `replay_demo.py`, and the blog post.

### Day by day

&#91;embedded content: 4-day plan · 3 owners, 1 checkpoint per day\]

If Friday's checkpoint slips, cut stretch features before anything on the solving path.

### MVP and stretch

| Feature | MVP | Stretch |
| --- | --- | --- |
| 10 villagers, 1 hand-tuned case, one graph per villager | Yes |  |
| Gossip with mutation, 12 ticks before play | Yes |  |
| Grounded answers with claim IDs and the guardrail | Yes |  |
| "Who told you?" and the rumor trace view | Yes |  |
| Contradictions (Q6a, Q6b, Q11) stored once with `IMPLICATES`, leads (Q8b), travel check (Q10) | Yes |  |
| Alibi independence (Q13) | Yes |  |
| Memory across sessions, one village per player | Yes |  |
| Detective over MCP with at least 6 tools | Yes |  |
| Accusation and reveal, deployed live | Yes |  |
| Killer reacts to your questions |  | Yes |
| God view, social circles (Q5) |  | Yes |
| Detective split into Interrogator and Analyst agents with handoffs |  | Yes |
| Scenario generator for new cases |  | Yes |

**If you fall behind, cut in this order:** social circles, God view, killer reaction, scenario generator. Never cut Q13 or the rumor trace; they are what makes this project different.

**Hard deadlines (IST):** features frozen Sunday 14:00, demo video recorded by Sunday 19:00, submitted by Sunday 21:00. That leaves 3 hours of buffer before the 23:59 close.

## Demo video script

Three minutes on a seeded game, so every take is identical. Record each segment separately from a saved game state, then cut them together.

**Questions asked off camera first.** The ranking only shows 12 to 9 once the motive, means and lie claims are on the record, and most of them come from villagers the video never shows. Before the ranking segment, `replay_demo.py` asks, in this order:

1. Bess: the sighting, Jonas in the Tavern, the argument and debt, Jonas leaving toward the Manor.
2. Hale: who was in the Tavern (backs Bess's and Imogen's alibis and Jonas at 20:45).
3. Imogen: who was in the Tavern.
4. Tilly: the bundle, Jonas at the Smithy at 17:30, the threat and Elena's debt.
5. Father Aldric: when Elena left the Chapel.
6. Elena: where she was from 21:00 to 22:00.
7. Jonas: where he was from 21:00 to 22:00 (his cover story).
8. Lady Wren, citing Bess's statement: Jonas was at the Manor.

That uses 8 of the 16 questions, and the trace uses 3 more (Brann, Hale, then Pip).

| Time | Screen | What happens and what to say |
| --- | --- | --- |
| 0:00 to 0:15 | Village map | "Ten villagers, one body, and each of them remembers the night differently." |
| 0:15 to 0:35 | Village panel | Ask who hears the most gossip. PageRank picks Bess, and the Cypher appears beside the answer. |
| 0:35 to 1:00 | Interrogate Bess | She says a man was near the Mill at 22:00, and that Jonas argued with Silas over money. |
| 1:00 to 1:20 | Elena, then Father Aldric | A red edge appears: she claims she stayed until 22:00, he saw her leave at 21:00. The travel check says Chapel to Mill takes 20 minutes, and she had 30. |
| 1:20 to 1:30 | Suspect ranking | With the sighting as "a man", Jonas leads 12 to 9: motive, means, a lie, and he fits. "This is what the village believes." |
| 1:30 to 1:55 | Rumor trace | Click "Who told you?" on Bess's sighting: Bess, then Brann, then Hale, then Pip. The Mill was really the Riverside path, 22:00 was really 21:30, and when Pip is asked himself, the man was a woman with a lantern. "Every hop is a claim in a different villager's graph." The ranking flips: Elena 12, Jonas 9. |
| 1:55 to 2:25 | Detective panel | The agent picks MCP tools on its own. Imogen's alibi has two independent sources; Lady Wren's has none. It ranks the suspects and accuses Elena, citing statements. |
| 2:25 to 2:45 | Reveal and God view | What happened, beside what the village believed, with all 13 graphs side by side. |
| 2:45 to 3:00 | Second session | Come back and Elena says: "You again. Last time you called me a liar." End on the tagline. |

## Rule compliance and risks

Every rule is covered by the design, but four items need someone to actually do them: the README, the AI disclosure, the track names and the team walkthrough.

- [ ] FalkorDB holds all memory, gossip and case data, and the game cannot run without it (rules 2 and 3)
- [ ] Main coding starts after 00:01 IST on 15 October; this design and the schema are allowed beforehand (rule 8)
- [ ] All data is fictional and synthetic (rule 6)
- [ ] Public repository
- [ ] README with setup, the graph data model and every Cypher query from this doc
- [ ] Demo video
- [ ] Live deployment, plus the `docker compose` instructions
- [ ] Tracks named at submission: Agent Memory and Coordination, and Agents That Act on Connected Data (rule 5)
- [ ] AI coding assistant use disclosed in the README, including that this design was drafted with Claude (rule 11)
- [ ] Saturday night walkthrough: each owner explains their part to the other two, so all three can answer judges' questions (rule 12)
- [ ] Agree on IP ownership within the team before submitting (rule 15)
- [ ] Blog post for the side prize

| Risk | What it breaks | Fallback |
| --- | --- | --- |
| Slow LLM answers | Interrogations drag and the video suffers | Stream tokens, use a fast model, cache answers for the seeded demo game |
| LLM invents clues | The case becomes unfair or unsolvable | Claim-ID guardrail with a template-sentence fallback |
| Gossip too chaotic | The killer cannot be found | Seeded randomness, tuned accuracy values, and `replay_demo.py` checks the solving path still works |
| CDLP gives different groups on each run | The circles view flickers | Compute once per game and cache |
| Free-tier limits on FalkorDB Cloud or the LLM | The live demo fails during judging | Document the `docker compose` fallback; add rate limits |
| Cypher features FalkorDB lacks | Queries fail late | Run `smoke_cypher.py` on day 1. Most likely to differ from this doc: `algo.labelPropagation`, `algo.SPpaths`, `Graph.copy()`, zero-length paths (`*0..8`) in Q7 and Q13, map literals inside the list comprehension in Q7, and `collect()` skipping nulls in Q13 |
| 13 graphs per game pile up on FalkorDB Cloud | Memory limit hit while judges play | Measured Oct 15 on our Cloud tier: `GRAPH.COPY` works (a new game copies in 1.3 to 3 s), but `maxmemory` is 100 MB with `noeviction`, the templates use about 19 MB, and each game adds about 13 MB (about 1 MB of fixed overhead per graph). That is room for about 6 live games, after which writes fail. Deleting a game frees its memory. Cap live games and delete the oldest idle one when a new game would pass the cap, rather than waiting 24 hours; or move to a bigger tier for judging week |
| Same seed, different village | Demo takes and `replay_demo.py` stop matching | Plan each tick sequentially, write in parallel; seeded IDs; `REPLAY=1` for the keyword parser and template answers; replay questions in a fixed order |
| Scope | An unfinished demo | Follow the cut order in the team plan |

## Review changes (Oct 15)

Fixes made after checking the queries against the demo case, before any code was written:

1. **Q14 no longer penalizes honest witnesses.** Lies are counted through a new `(:Contradiction)-[:IMPLICATES]->(:Person)` edge instead of `INVOLVES`, which made Father Aldric a liar for catching Elena. Q14 also gained a `fits` term, which breaks the Elena and Jonas tie.
2. **Q6a, Q6b and Q11 compare first-hand claims only.** Gossip mutation would otherwise fill the board with false contradictions. Elena's planted lie is now caught by Q6a, so it is stored as a `WAS_AT` claim.
3. **Q8 is a list of leads, not contradictions.** Honest sole witnesses match it too. It has its own MCP tool, `uncorroborated_leads()`.
4. **Q13 counts eyewitness origins only.** Untraced heard claims are returned as unverified, so a relayed rumor can no longer pass as a second witness.
5. **Gossip ticks are planned sequentially and written in parallel.** Drawing random numbers inside parallel tasks would make the same seed give different villages.
6. **`root_id` never leaves the backend.** It is used to link `DERIVED_FROM`, but stripped from MCP and API output so the detective cannot group rumors without asking.

Second round, from a review of the fixes above:

7. **Contradictions are merged on a key** (kind plus both statement IDs), with `IMPLICATES` added only on create. Re-running the checks after every answer used to multiply lies.
8. **Q8 is split into Q8a (backing count) and Q8b (leads).** Backing now counts only first-hand claims from other people with the same predicate. Before, a liar could back herself, a heard copy could back the original, and Elena's "until 22:00" backed Father Aldric's "left at 21:00".
9. **The `IMPLICATES` rule is ordered:** Q6b goes to the person who claimed to stay, Q6a goes to the side with less backing, with self-claims breaking ties. Q14 counts each lie once through `root_id` on the edge.
10. **Elena's planted lie moved from 21:15 to 20:45,** when Jonas was in the Tavern in front of witnesses. At 21:15 it implicated Jonas instead of her.
11. **Time overlaps are strict, and point events are 10-minute windows.** Touching windows (until 21:00, from 21:00) no longer clash.
12. **Q12 runs Q13 for every match first, and descriptions match on `adult`.** Otherwise Bess, Imogen and Tilly were listed as suspects.
13. **IDs are seeded (`uuid5`), and `REPLAY=1` swaps the LLM parser and renderer for keyword and template versions,** so the same seed gives the same game.
14. **Case data added:** Tilly overhears Elena's debt and sees Jonas at the Smithy at 17:30, Bess, Hale and Imogen place Jonas and each other in the Tavern, and Elena gets a stretch rule that changes her story so Q11 has something to catch.

Third round:

15. **Contradictions are keyed on claim IDs.** Q6a, Q6b and Q11 now return both claim IDs and both statement IDs, the `MERGE` returns `x.new`, and two clashes from the same pair of answers stay separate.
16. **`IMPLICATES` is recomputed for every contradiction on each check,** so a tie broken early is revisited once more people talk.
17. **Q11 implicates through the earlier, abandoned claim,** so a confession isn't counted as a second lie. Q6a skips same-teller pairs, so a changed story fires Q11 only. With the stretch rules Elena is at 14, not 16.
18. **`alibi_confirmed` is only written for the time of death.** A detective check at any other time returns a result without overwriting the flag.
19. **`LEFT` claims carry `toward_id`,** so Lady Wren's second trust condition (a statement putting Jonas on the way to the Manor) can actually be met.
20. **The demo script was reordered:** Elena and Aldric, then the ranking with "a man" (Jonas 12, Elena 9), then the trace and the flip (Elena 12, Jonas 9). `replay_demo.py` asks 8 villagers off camera first.
21. **Smaller fixes:** Q2 breaks ties on `c.id`, `seeded_id` includes the parent claim, the Tavern witnesses state Jonas's argument and debt, and the Q13 text no longer says Imogen is confirmed before anyone is asked.

Fourth round, from building `hollowmere.json`:

22. **The night's rumor is scripted in three hops** (Pip → Hale → Brann → Bess), one detail per hop, each changed by the teller. The old two-hop version needed three changes in one hop. The rumor's 22:30 is now 22:00 everywhere (Jonas at the Manor until 22:30 is unchanged), Pip muddles the woman into a man himself, and the trace costs one more question (Brann).
23. **The Riverside path is the 8th place,** splitting the 20-minute Chapel-to-Mill walk 10 + 10.
24. **Q1b recalls by place,** because Q1 can't find a sighting about a description.
25. **Rules have one switch:** `w02_activate_rule` sets `Rule.active` and raises the dormant lie claims together.
26. **The data model gains** `Gate` (Lady Wren's trust gate), the villager's starting trust toward the player on `Self`, and the `Rule` fields the liars need.
27. **Q1 and Q1b drop claims an active rule hides, before `LIMIT`,** and break ties on `claim_id`. Elena's changed-story rule now hides her true whereabouts and her abandoned cover story.

Fifth round, from building the whole game:

28. **Secrets stay secret in interrogation.** Q1 and Q1b never return a `private` claim unless a `Gate` guards it, so Elena can't confess to the hammer when asked about 17:30, and the gate decides about Lady Wren's affair. An active rule also covers what a liar has heard about herself next to its window.
29. **The pre-game ticks run in `seed.py`.** The same seed gives the same morning, so templates carry the 12 ticks and `POST /games` only copies graphs. `seeded_id` hashes the seed, not the game id, so two games from one seed are identical (`check_engine.py`).
30. **Following a rumor asks the source about that rumor.** `about_claim_id` maps the clicked case claim to its `root_id` on the backend and runs Q1d on the source villager's graph. Each hop of the trace costs a question.
31. **The case board records the claims an answer cites.** With templates every retrieved claim is cited; with the LLM, an answer that leaves a claim out leaves it off the board, so Q14 scores can be lower than the REPLAY numbers.
32. **The detective connects over MCP in-process by default** (`mcp.Client(server)`), so its queries reach the live monitor; `DETECTIVE_TRANSPORT=stdio` runs the server as a subprocess. If the LLM stalls or hits rate limits, a scripted detective finishes from the board as it stands.
33. **FalkorDB Cloud's 100 MB tier fits about five live games** (about 14 MB each, templates about 21 MB); `MAX_GAMES` deletes the least recently used game first.
