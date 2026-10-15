// Q1c. Everything the renderer needs about the claims Q1/Q1b picked.
// Graph: game_<g>_npc_<id> (the villager's own memory)
// Params: $claim_ids
// Q1 and Q1b return just enough to rank claims; this fills in who, what, where and from whom,
// so the answer (template or LLM) is built from graph facts only. Python restores the input order.
UNWIND $claim_ids AS cid
MATCH (c:Claim {id: cid})
OPTIONAL MATCH (c)-[:ABOUT]->(x)
OPTIONAL MATCH (c)-[:AT]->(pl:Place)
OPTIONAL MATCH (c)-[:INVOLVES]->(o:Object)
OPTIONAL MATCH (c)-[:HEARD_FROM]->(src:Person)
OPTIONAL MATCH (tw:Place {id: c.toward_id})
OPTIONAL MATCH (op:Person {id: c.object_id})
RETURN c.id AS claim_id, c.pred AS pred, c.subject_id AS subject_id, coalesce(x.name, x.text) AS who,
       c.place_id AS place_id, pl.name AS place, coalesce(o.name, op.name) AS object, tw.name AS toward,
       c.t_from AS t_from, c.t_to AS t_to, c.confidence AS confidence, c.origin AS origin,
       c.crowns AS crowns, c.note AS note, src.id AS heard_from_id, src.name AS heard_from
