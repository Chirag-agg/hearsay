// Q1d. What do I believe about this rumor? Following "who told you?" one hop back.
// Graph: game_<g>_npc_<id> (the source villager's own memory)
// Params: $root_id
// The backend maps the case claim the player clicked to its root_id, which never leaves the
// backend, and asks the source villager for their own version of that same rumor.
MATCH (c:Claim {root_id: $root_id})
WHERE c.confidence >= 0.2 AND (coalesce(c.private, false) = false OR coalesce(c.gated, false))
RETURN c.id AS claim_id, c.pred AS pred, c.t_from AS t_from, c.t_to AS t_to,
       c.confidence AS confidence, c.origin AS origin
ORDER BY confidence DESC, claim_id
LIMIT 3
