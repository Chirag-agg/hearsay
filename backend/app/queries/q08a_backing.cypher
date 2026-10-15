// Q8a. How many people back this claim? Distinct other tellers, first-hand, same predicate/person/place, overlapping time.
// Graph: game_<g>_case. Used by the IMPLICATES rule.
// Params: $claim_id
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {id: $claim_id}), (s)-[:SAID_BY]->(teller:Person)
OPTIONAL MATCH (s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'}), (s2)-[:SAID_BY]->(t2:Person)
WHERE t2.id <> teller.id AND c2.pred = c.pred AND c2.subject_id = c.subject_id
  AND c2.place_id = c.place_id AND c2.t_from < c.t_to AND c.t_from < c2.t_to
RETURN count(DISTINCT t2) AS backing
