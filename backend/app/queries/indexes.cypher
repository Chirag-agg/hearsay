// Indexes. Run once per template graph; GRAPH.COPY carries them into every game.
// One statement per semicolon. Statement and Contradiction indexes back the case-graph MERGEs.
CREATE INDEX FOR (c:Claim) ON (c.id);
CREATE INDEX FOR (c:Claim) ON (c.root_id);
CREATE INDEX FOR (p:Person) ON (p.id);
CREATE INDEX FOR (pl:Place) ON (pl.id);
CREATE INDEX FOR (s:Statement) ON (s.id);
CREATE INDEX FOR (x:Contradiction) ON (x.key)
