// Q10. Could they get there in time? Weighted shortest path over ROAD.minutes.
// Graph: game_<g>_case (seeded with the public map) or game_<g>_village
// Params: $from_place, $to_place, $from_t, $to_t
MATCH (a:Place {id: $from_place}), (b:Place {id: $to_place})
CALL algo.SPpaths({sourceNode: a, targetNode: b, relTypes: ['ROAD'],
                   weightProp: 'minutes', relDirection: 'outgoing'})
YIELD path, pathWeight
RETURN pathWeight AS minutes_needed, $to_t - $from_t AS minutes_available,
       pathWeight <= $to_t - $from_t AS possible, [n IN nodes(path) | n.name] AS route
