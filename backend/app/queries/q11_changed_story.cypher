// Q11. Stories that changed between questions. First-hand only; the lie counted is the earlier claim (claim_1).
// Graph: game_<g>_case
// Params: none
MATCH (n:Person)<-[:SAID_BY]-(s1:Statement)-[:ASSERTS]->(c1:Claim {reported_as: 'saw'}),
      (n)<-[:SAID_BY]-(s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'})
WHERE s1.tick < s2.tick AND c1.pred = c2.pred AND c1.subject_id = c2.subject_id
  AND c1.t_from < c2.t_to AND c2.t_from < c1.t_to AND c1.place_id <> c2.place_id
RETURN n.name AS villager, c1.subject_id AS about, c1.place_id AS first_said,
       s1.session AS session_1, c2.place_id AS later_said, s2.session AS session_2,
       s1.id AS stmt_1, s2.id AS stmt_2, c1.id AS claim_1, c2.id AS claim_2
