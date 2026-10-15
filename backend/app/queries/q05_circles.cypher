// Q5. Which circles cover for each other? Label propagation (CDLP).
// Graph: game_<g>_village. Results can vary between runs: compute once per game and cache.
// Params: none
CALL algo.labelPropagation({nodeLabels: ['Person'], relationshipTypes: ['KNOWS']})
YIELD node, communityId
RETURN communityId, collect(node.name) AS circle
ORDER BY size(circle) DESC
