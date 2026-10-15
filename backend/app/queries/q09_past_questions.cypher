// Q9. What has this player asked me before? Episodic memory for the persona prompt.
// Graph: game_<g>_npc_<id>
// Params: $player
MATCH (:Self)-[:HAD]->(conv:Conversation {player_id: $player})-[:INCLUDED]->(q:Question)
OPTIONAL MATCH (q)-[a:ANSWERED_WITH]->(c:Claim)
RETURN conv.session AS session, q.tick AS tick, q.text AS asked, collect(c.id) AS answered_with
ORDER BY tick DESC
LIMIT 3
