// Q1. What do I believe about this person in this window?
// Graph: game_<g>_npc_<id> (the villager's own memory)
// Params: $person, $t_from, $t_to
// Claims an active Rule hides (a liar's true whereabouts) are dropped before LIMIT, so the
// rule's lie can't be crowded out; dormant lies sit at confidence 0 until W2 switches them on.
// claim_id breaks confidence ties so REPLAY=1 gets the same five claims every run.
MATCH (c:Claim)-[:ABOUT]->(x {id: $person})
WHERE c.t_from <= $t_to AND c.t_to >= $t_from AND c.confidence >= 0.2
OPTIONAL MATCH (r:Rule {active: true}) WHERE c.id IN r.hides
WITH c, count(r) AS hidden_by
WHERE hidden_by = 0
OPTIONAL MATCH (c)-[:AT]->(pl:Place)
OPTIONAL MATCH (c)-[:HEARD_FROM]->(src:Person)
RETURN c.id AS claim_id, c.pred AS pred, pl.name AS place, c.t_from AS t_from, c.t_to AS t_to,
       c.confidence AS confidence, c.origin AS origin, src.name AS heard_from
ORDER BY confidence DESC, claim_id
LIMIT 5
