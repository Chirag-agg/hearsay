// Q6b. Claims to have stayed, but someone saw them leave. The whole LEFT window must fall inside the stay.
// Graph: game_<g>_case
// Params: none
// The WITH is required: see q06a_two_places.cypher.
MATCH (s1:Statement)-[:ASSERTS]->(c1:Claim {pred: 'WAS_AT', reported_as: 'saw'}),
      (s2:Statement)-[:ASSERTS]->(c2:Claim {pred: 'LEFT', reported_as: 'saw'})
WHERE c1.subject_id = c2.subject_id AND c1.place_id = c2.place_id
  AND c2.t_from > c1.t_from AND c2.t_to < c1.t_to
WITH s1, c1, s2, c2
MATCH (s1)-[:SAID_BY]->(n1:Person), (s2)-[:SAID_BY]->(n2:Person)
WHERE n1.id <> n2.id
RETURN c1.subject_id AS person, c1.place_id AS place, n1.name AS claims_stayed,
       c1.t_to AS until, n2.name AS says_left, c2.t_from AS left_at, s1.id AS stmt_1, s2.id AS stmt_2,
       c1.id AS claim_1, c2.id AS claim_2
