// W1. Store a contradiction once. key = kind + the two claim ids, sorted.
// Graph: game_<g>_case. IMPLICATES edges are recomputed separately on every check.
// Params: $key, $kind, $claim_1, $claim_2, $detail, $tick, $stmt_1, $stmt_2
MERGE (x:Contradiction {key: $key})
ON CREATE SET x.kind = $kind, x.claim_1 = $claim_1, x.claim_2 = $claim_2,
              x.detail = $detail, x.tick = $tick, x.new = true
ON MATCH SET x.new = false
WITH x
MATCH (s1:Statement {id: $stmt_1}), (s2:Statement {id: $stmt_2})
MERGE (x)-[:INVOLVES]->(s1)
MERGE (x)-[:INVOLVES]->(s2)
RETURN x.new AS new
