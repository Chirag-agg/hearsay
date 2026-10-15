// Q3. Who told me?
// Graph: game_<g>_npc_<id>
// Params: $claim_id
MATCH (c:Claim {id: $claim_id})-[h:HEARD_FROM]->(src:Person)
RETURN src.id AS source_id, src.name AS source, h.tick AS tick
