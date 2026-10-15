// Q4. Who hears the most gossip? PageRank over KNOWS.
// Graph: game_<g>_village
// Params: none
CALL algo.pageRank('Person', 'KNOWS') YIELD node, score
RETURN node.name AS villager, score
ORDER BY score DESC
LIMIT 3
