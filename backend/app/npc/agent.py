"""Villager agent: one question, start to finish (see "Villager agent" in the architecture doc).

1. Parse     keyword parser (REPLAY=1) -> intent, people, places, time window
2. Retrieve  Q1 per person, Q1b per place, on this villager's own graph only
3. Rules     already applied inside Q1/Q1b: an active Rule's lie replaces what it covers
4. Gate      Gate nodes hold back claims until trust is high enough or the player cites the key fact
5. Render    template sentences (REPLAY=1), or the LLM with claims as JSON
6. Guardrail every person, place and time in the dialogue must come from the cited claims;
             the LLM gets one stricter retry, then the template answer is used
7. Write back (next): Question/Conversation here, Statement/Claims in the case graph

The agent never sees another villager's graph, so it can only say what this villager knows.
"""

import os

from app import db
from app.npc import llm
from app.npc.parse import PLACE_ALIASES, TITLES, Parser
from app.npc.render import guardrail, template_answer

MAX_CLAIMS = 3
MOTIVE_PREDS = {"OWES", "THREATENED", "ARGUED_WITH"}


def replay_mode() -> bool:
    return os.getenv("REPLAY", "0") == "1" or not llm.configured()


class Villager:
    def __init__(self, villager_id: str, graphs: db.Graphs = db.TEMPLATES, player_id: str = "p1"):
        self.id = villager_id
        self.graphs = graphs
        self.graph = graphs.npc(villager_id)
        self.player_id = player_id
        self.me = db.run_cypher(self.graph, "MATCH (s:Self) RETURN properties(s) AS s",
                                label="agent self", readonly=True)[0]["s"]
        self.parser = Parser(graphs.village, villager_id)
        people = db.run_cypher(graphs.village, "MATCH (p:Person) RETURN p.id AS id, p.name AS name, p.sex AS sex",
                               label="agent vocabulary", readonly=True)
        self.pronouns = {p["id"]: "she" if p["sex"] == "f" else "he" for p in people}
        person_words = {p["name"] for p in people}
        person_words |= {w for p in people for w in p["name"].replace(".", "").split() if w.lower() not in TITLES}
        self.vocabulary = {"person": sorted(person_words), "place": sorted(set(PLACE_ALIASES.values()))}

    # ------------------------------------------------------------ steps

    def _retrieve(self, parsed) -> tuple[list[dict], list[dict]]:
        rows, calls = [], []
        window = {"t_from": parsed.t_from, "t_to": parsed.t_to}
        if parsed.person_ids:
            for pid in parsed.person_ids:
                params = {"person": pid, **window}
                calls.append({"query": "q01_recall", "params": params})
                rows += [{**r, "about": pid} for r in db.run(self.graph, "q01_recall", params)]
        elif parsed.place_ids:
            for place in parsed.place_ids:
                params = {"place": place, **window}
                calls.append({"query": "q01b_recall_place", "params": params})
                rows += db.run(self.graph, "q01b_recall_place", params)
        return rows, calls

    def _gates(self, trust: float, cites: list[tuple[str, str, str]]) -> tuple[set[str], list[str]]:
        """Claim ids still held back, and the refusals that go with them."""
        held, refusals = set(), []
        for r in db.run_cypher(self.graph, "MATCH (g:Gate)-[:GUARDS]->(c:Claim) "
                                           "RETURN properties(g) AS g, collect(c.id) AS guards",
                               label="agent gates", readonly=True):
            g = r["g"]
            key = (g.get("cite_pred"), g.get("cite_subject_id"), g.get("cite_toward_id"))
            if trust >= g.get("min_trust", 1.0) or key in cites:
                continue
            held |= set(r["guards"])
            refusals.append(g.get("refusal", "I'd rather not say."))
        return held, refusals

    def _apply_rules(self, parsed, rows: list[dict]) -> list[dict]:
        """A question that touches an active rule's topic gets the rule's lie and nothing else
        about that person: Q1 already drops what overlaps the rule's window, and this also drops
        what the liar has heard about herself next to it ("Aldric says you left at 21:00")."""
        rules = db.run_cypher(self.graph, "MATCH (r:Rule {active: true}) WHERE r.subject_id IS NOT NULL "
                                          "RETURN r.subject_id AS subject, r.t_from AS t_from, r.t_to AS t_to, "
                                          "r.uses AS uses", label="agent rules", readonly=True)
        for rule in rules:
            if rule["subject"] in parsed.person_ids and parsed.t_from < rule["t_to"] and rule["t_from"] < parsed.t_to:
                rows = [r for r in rows if r.get("about") != rule["subject"] or r["claim_id"] in (rule["uses"] or [])]
        return rows

    def _details(self, claim_ids: list[str]) -> list[dict]:
        if not claim_ids:
            return []
        rows = {r["claim_id"]: r for r in db.run(self.graph, "q01c_claim_details", {"claim_ids": claim_ids})}
        return [rows[cid] for cid in claim_ids if cid in rows]

    # ------------------------------------------------------------ the loop

    def ask(self, question: str, *, trust: float | None = None,
            cites: list[tuple[str, str, str]] = (), replay: bool | None = None) -> dict:
        replay = replay_mode() if replay is None else replay
        trust = self.me.get("player_trust", 0.5) if trust is None else trust
        parsed = self.parser.parse(question)
        rows, calls = self._retrieve(parsed)
        rows = self._apply_rules(parsed, rows)

        held, refusals = self._gates(trust, list(cites))
        withheld = [r["claim_id"] for r in rows if r["claim_id"] in held]
        rows = [r for r in rows if r["claim_id"] not in held]

        # Prefer what the question is about: the places it names, or motive claims for "why/owe/argue".
        def rank(r):
            on_place = parsed.place_ids and r.get("place") and any(
                p in r["place"].lower() for p in parsed.place_ids)
            on_motive = parsed.intent == "motive" and r["pred"] in MOTIVE_PREDS
            return (-(bool(on_place) + bool(on_motive)), -r["confidence"], r["claim_id"])
        seen, picked = set(), []
        for r in sorted(rows, key=rank):
            if r["claim_id"] not in seen:
                seen.add(r["claim_id"])
                picked.append(r["claim_id"])
        claims = self._details(picked[:MAX_CLAIMS])
        by_id = {c["claim_id"]: c for c in claims}
        memory = db.run(self.graph, "q09_past_questions", {"player": self.player_id})

        answer, mode, attempts = None, "template", []
        if not replay and claims:
            for strict in (False, True):
                draft = llm.render(self.me, claims, memory, question, trust, strict=strict)
                problems = guardrail(draft["dialogue"], draft["claim_ids_used"], by_id, self.vocabulary, self.me["name"])
                attempts.append({"dialogue": draft["dialogue"], "problems": problems})
                if not problems:
                    answer, mode = draft, "llm"
                    break
        if answer is None:
            answer = template_answer(claims, self.id, self.pronouns)
            if attempts:
                mode = "template (llm failed the guardrail)"
        refusal = " ".join(refusals) if withheld else ""
        if refusal and not claims:
            answer = {"dialogue": refusal, "claim_ids_used": [], "emotion": "guarded"}
            mode = "gate refusal"
        elif refusal and refusal not in answer["dialogue"]:
            answer = {**answer, "dialogue": f"{answer['dialogue']} {refusal}", "emotion": "guarded"}
        # A gate's refusal is scripted in the graph, so its words are allowed too.
        problems = guardrail(answer["dialogue"].replace(refusal, "") if refusal else answer["dialogue"],
                             answer["claim_ids_used"], by_id, self.vocabulary, self.me["name"])

        return {"villager": self.id, "name": self.me["name"], "question": question, "parsed": parsed.as_dict(),
                "queries": calls, "claims": claims, "withheld": withheld, "memory": memory,
                "dialogue": answer["dialogue"], "claim_ids_used": answer["claim_ids_used"],
                "emotion": answer.get("emotion", "neutral"), "mode": mode, "llm_attempts": attempts,
                "guardrail": problems, "trust": trust}

    def who_told(self, claim_id: str) -> dict:
        """The "Who told you?" button: Q3 on this villager's graph."""
        source = db.run(self.graph, "q03_who_told_me", {"claim_id": claim_id})
        claims = self._details([claim_id])
        if not claims:
            dialogue = "I don't know what you mean."
        elif source:
            dialogue = f"I heard it from {source[0]['source']}."
        else:
            dialogue = "Nobody told me. I saw it myself." if claims[0]["origin"] != "lie" else "I saw it myself."
        problems = guardrail(dialogue, [c["claim_id"] for c in claims], {c["claim_id"]: c for c in claims},
                             self.vocabulary, self.me["name"])
        return {"villager": self.id, "claim_id": claim_id, "dialogue": dialogue, "source": source,
                "claims": claims, "guardrail": problems}
