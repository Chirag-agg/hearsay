// Q6a. Same person, two places at once. First-hand claims only, strict overlap, different tellers.
// Graph: game_<g>_case
// Params: none
// The WITH is required: without it FalkorDB 4.x drops the s-c pairing when the second MATCH
// reuses s1/s2, and returns statements joined to claims they never asserted (smoke_cypher.py checks this).
MATCH (s1:Statement)-[:ASSERTS]->(c1:Claim {pred: 'WAS_AT', reported_as: 'saw'}),
      (s2:Statement)-[:ASSERTS]->(c2:Claim {pred: 'WAS_AT', reported_as: 'saw'})
WHERE c1.subject_id = c2.subject_id AND c1.place_id <> c2.place_id
  AND c1.t_from < c2.t_to AND c2.t_from < c1.t_to AND c1.id < c2.id
WITH s1, c1, s2, c2
MATCH (s1)-[:SAID_BY]->(n1:Person), (s2)-[:SAID_BY]->(n2:Person)
WHERE n1.id <> n2.id
RETURN c1.subject_id AS person, n1.name AS says_1, c1.place_id AS place_1,
       n2.name AS says_2, c2.place_id AS place_2, s1.id AS stmt_1, s2.id AS stmt_2,
       c1.id AS claim_1, c2.id AS claim_2
