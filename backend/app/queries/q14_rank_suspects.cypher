// Q14. Rank the suspects: motive, means, lies (via IMPLICATES), fit to the scene sighting, alibi.
// Graph: game_<g>_case
// Params: $victim, $weapon_place, $death_t, $sighting
// FalkorDB 4.x: after an OPTIONAL MATCH + aggregation, a later OPTIONAL MATCH anchored on p that
// filters the other end ({id: $sighting} or WHERE d.id = $sighting) matches nothing. Collecting the
// descriptions p fits and testing membership works; smoke_cypher.py checks it.
MATCH (p:Person) WHERE p.id <> $victim
OPTIONAL MATCH (:Statement)-[:ASSERTS]->(m:Claim)
WHERE m.pred IN ['OWES', 'THREATENED', 'ARGUED_WITH']
  AND ((m.subject_id = p.id AND m.object_id = $victim) OR (m.subject_id = $victim AND m.object_id = p.id))
WITH p, count(DISTINCT m.pred) AS motive
OPTIONAL MATCH (:Statement)-[:ASSERTS]->(w:Claim)
WHERE w.subject_id = p.id AND w.place_id = $weapon_place AND w.t_to <= $death_t
WITH p, motive, count(w) AS means
OPTIONAL MATCH (:Contradiction)-[i:IMPLICATES]->(p)
WITH p, motive, means, count(DISTINCT i.root_id) AS lies
OPTIONAL MATCH (d:Description)-[:FITS]->(p)
WITH p, motive, means, lies, CASE WHEN $sighting IN collect(d.id) THEN 1 ELSE 0 END AS fits
RETURN p.id AS suspect_id, p.name AS suspect, motive, means, lies, fits, coalesce(p.alibi_confirmed, false) AS alibi,
       motive * 2 + CASE WHEN means > 0 THEN 3 ELSE 0 END + lies * 2 + fits * 3
         - CASE WHEN coalesce(p.alibi_confirmed, false) THEN 5 ELSE 0 END AS score
ORDER BY score DESC
