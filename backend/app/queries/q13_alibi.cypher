// Q13. Is this alibi really confirmed by independent sources? Only eyewitness origins count.
// Graph: game_<g>_case. The backend writes alibi_confirmed only when $t is the time of death.
// Params: $person, $t, $scene
MATCH (s:Statement)-[:ASSERTS]->(c:Claim {pred: 'WAS_AT'})
WHERE c.subject_id = $person AND c.t_from <= $t AND c.t_to >= $t
  AND c.place_id <> $scene AND c.teller_id <> $person
MATCH (c)-[:DERIVED_FROM*0..8]->(o:Claim)
OPTIONAL MATCH (o)-[nx:DERIVED_FROM]->(:Claim)
WITH c, o, nx WHERE nx IS NULL
WITH c.place_id AS place,
     collect(DISTINCT CASE WHEN o.reported_as = 'saw' THEN o.teller_id END) AS eyewitnesses,
     collect(DISTINCT CASE WHEN o.reported_as = 'heard' THEN c.id END) AS unverified
RETURN place, eyewitnesses, unverified, size(eyewitnesses) >= 2 AS confirmed
