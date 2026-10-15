// Q1. What do I believe about this person in this window?
// Graph: game_<g>_npc_<id> (the villager's own memory)
// Params: $person, $t_from, $t_to
// Private claims (secrets) never come out unless a Gate guards them; the agent opens the gate.
// An active Rule covers its topic: it drops the claims it `hides`, and every other claim about
// its subject inside its window (gossip a liar has heard about herself), except its own lie.
// That happens before LIMIT, so the lie can't be crowded out. Dormant lies sit at confidence 0
// until W2 switches their rule on. claim_id breaks ties so REPLAY=1 gets the same five claims.
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
