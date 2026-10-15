// Q7. Trace a rumor to its origin. Python diffs consecutive hops to highlight what changed.
// Graph: game_<g>_case
// Params: $claim_id
MATCH path = (c:Claim {id: $claim_id})-[:DERIVED_FROM*0..8]->(origin:Claim)
WITH path, origin
ORDER BY length(path) DESC
LIMIT 1
OPTIONAL MATCH (origin)-[:SOURCED_FROM]->(next:Person)
RETURN [n IN nodes(path) | {claim: n.id, teller: n.teller_id, about: n.subject_id,
         place: n.place_id, t_from: n.t_from, reported_as: n.reported_as}] AS chain,
       origin.reported_as = 'saw' AS reached_eyewitness, next.id AS ask_next
