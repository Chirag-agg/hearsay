// W2. Switch a liar's rule on. The only way to activate one.
// Graph: game_<g>_npc_<id>
// Params: $rule_id
// Rule.active and its claims' confidence change in one statement, so they can't disagree:
// dormant lie claims sit at confidence 0 (Q1 and Q2 skip them) until their rule fires.
// A rule that supersedes another (Elena's changed story replaces her cover story) switches the old one off.
MATCH (r:Rule {id: $rule_id})
SET r.active = true
WITH r
OPTIONAL MATCH (r)-[:USES]->(c:Claim)
SET c.confidence = 1.0, c.dormant = false
WITH r, count(c) AS claims
OPTIONAL MATCH (old:Rule {id: r.supersedes})
SET old.active = false
RETURN r.id AS rule_id, claims, old.id AS superseded
