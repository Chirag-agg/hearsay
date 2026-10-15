// Q2. What will I gossip about next?
// Graph: game_<g>_npc_<id> (the teller)
// Params: $listener_roots (root_ids the listener already holds)
// c.id breaks ties so equal scores come back in an order the seed controls.
MATCH (c:Claim)
WHERE c.confidence >= 0.2 AND coalesce(c.private, false) = false AND NOT c.root_id IN $listener_roots
RETURN c
ORDER BY c.salience * c.confidence DESC, c.id
LIMIT 2
