// Q12. Who fits the description and has no confirmed alibi? Run Q13 for every match first.
// Graph: game_<g>_case
// Params: $description_id
MATCH (d:Description {id: $description_id})-[:FITS]->(p:Person)
WHERE p.alibi_confirmed IS NULL OR p.alibi_confirmed = false
RETURN p.id AS suspect_id, p.name AS suspect
