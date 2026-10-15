// Q8b. Eyewitness claims nobody else backs up. Leads, not contradictions: never drawn as red edges.
// Graph: game_<g>_case
// Params: none
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {reported_as: 'saw'}), (s)-[:SAID_BY]->(teller:Person)
WHERE c.subject_id <> teller.id
OPTIONAL MATCH (s2:Statement)-[:ASSERTS]->(c2:Claim {reported_as: 'saw'}), (s2)-[:SAID_BY]->(t2:Person)
WHERE t2.id <> teller.id AND c2.pred = c.pred AND c2.subject_id = c.subject_id
  AND c2.place_id = c.place_id AND c2.t_from < c.t_to AND c.t_from < c2.t_to
WITH s, c, teller, count(DISTINCT t2) AS backing
WHERE backing = 0
RETURN teller.name AS only_source, c.pred AS what, c.subject_id AS about, c.place_id AS place,
       c.t_from AS t_from, s.tick AS first_told
