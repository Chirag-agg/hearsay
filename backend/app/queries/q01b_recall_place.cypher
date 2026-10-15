// Q1b. What do I believe happened at this place in this window?
// Graph: game_<g>_npc_<id> (the villager's own memory)
// Params: $place, $t_from, $t_to
// Q1 is keyed on a person, so a sighting about a Description ("a man near the Mill") needs this one.
// x is unlabeled: ABOUT points at a Person (name) or a Description (text).
// Like Q1, claims an active Rule covers are dropped before LIMIT.
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
