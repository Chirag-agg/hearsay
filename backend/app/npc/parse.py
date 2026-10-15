"""Keyword parser: question -> {intent, person_ids, place_ids, time_window}.

This is the REPLAY=1 parser (and the LLM parser's fallback): no model, so the same question
always picks the same query template. Names, surnames and roles come from the village graph;
times are read as the night of the murder unless the question says morning or am.
"""

import re
from dataclasses import dataclass, field

from app import db

TITLES = {"father", "lady", "dr", "constable", "doctor"}
ROLE_ALIASES = {
    "priest": "aldric", "barkeep": "bess", "barmaid": "bess", "blacksmith": "jonas", "smith": "jonas",
    "constable": "hale", "doctor": "imogen", "physician": "imogen", "miller": "brann",
    "moneylender": "silas", "victim": "silas", "drunk": "pip", "child": "tilly", "girl": "tilly",
}
PLACE_ALIASES = {
    "square": "square", "tavern": "tavern", "inn": "tavern", "pub": "tavern", "bar": "tavern",
    "smithy": "smithy", "forge": "smithy", "shop": "herbalist", "chapel": "chapel", "church": "chapel",
    "prayer": "chapel", "prayers": "chapel", "manor": "manor", "mill": "mill", "river": "riverside",
    "riverside": "riverside", "path": "riverside",
}
SELF_WORDS = {"you", "your", "yourself"}
NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
           "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}
EVENING = (960, 1440)  # 16:00 to midnight: the night of the murder
MORNING = (1740, 1860)  # 05:00 to 07:00 the next day, when the body was found
INTENTS = [  # first match wins
    ("who_told_you", ("who told", "heard it", "hear that", "how do you know", "where did you hear")),
    ("motive", ("owe", "debt", "money", "crown", "argu", "threat", "quarrel", "fight", "why")),
    ("object", ("hammer", "bundle", "lantern", "key", "carry", "weapon")),
    ("saw_who", ("see ", "saw", "seen", "notice", "anyone", "anybody", "who was")),
    ("whereabouts", ("where", "when", "leave", "left", "stay", "were you", "was ", "at prayer")),
]


@dataclass
class Parsed:
    intent: str
    person_ids: list[str] = field(default_factory=list)
    place_ids: list[str] = field(default_factory=list)
    t_from: int = EVENING[0]
    t_to: int = EVENING[1]

    def as_dict(self) -> dict:
        return {"intent": self.intent, "person_ids": self.person_ids, "place_ids": self.place_ids,
                "time_window": [self.t_from, self.t_to]}


class Parser:
    def __init__(self, village_graph: str, self_id: str):
        people = db.run_cypher(village_graph, "MATCH (p:Person) RETURN p.id AS id, p.name AS name",
                               label="parse names", readonly=True)
        self.self_id = self_id
        self.names: dict[str, str] = dict(ROLE_ALIASES)
        for p in people:
            for token in re.findall(r"[a-z]+", p["name"].lower()):
                if token not in TITLES:
                    self.names[token] = p["id"]

    def parse(self, question: str) -> Parsed:
        text = question.lower()
        words = re.findall(r"[a-z']+", text)
        intent = next((name for name, cues in INTENTS if any(c in text + " " for c in cues)), "general")

        persons: list[str] = []
        for w in words:
            pid = self.self_id if w in SELF_WORDS else self.names.get(w.removesuffix("'s"))
            if pid and pid not in persons:
                persons.append(pid)
        places: list[str] = []
        for i, w in enumerate(words):
            pid = PLACE_ALIASES.get(w.removesuffix("'s"))
            if w.startswith("herbalist") and (i + 1 < len(words) and words[i + 1] == "shop"):
                pid = "herbalist"
            if pid and pid not in places:
                places.append(pid)
        if "herbalist" in words and "herbalist" not in places and "elena" not in persons:
            persons.append("elena")  # "the herbalist" is Elena; "the herbalist shop" is a place

        if persons == [self.self_id] and places and intent in ("saw_who", "general"):
            persons = []  # "did you see anyone at the Mill?" asks about the Mill, not about you
        parsed = Parsed(intent, persons, places)
        parsed.t_from, parsed.t_to = self._window(text)
        return parsed

    def _window(self, text: str) -> tuple[int, int]:
        times = [t for _, t in sorted(self._times(text))]
        morning = "morning" in text
        if not times:
            return MORNING if morning else EVENING
        if len(times) >= 2:
            return min(times), max(times)
        t = times[0]
        if re.search(r"\b(before|until|till|by)\b", text):
            return EVENING[0], t
        if re.search(r"\b(after|since|from)\b", text):
            return t, MORNING[1] if t >= MORNING[0] else EVENING[1]
        return t - 15, t + 15

    def _times(self, text: str) -> list[tuple[int, int]]:
        """(position in text, minutes) for every time mentioned."""
        found = []
        for m in re.finditer(r"\b(\d{1,2})[:.](\d{2})\b", text):
            found.append((m.start(), self._clock(int(m.group(1)), int(m.group(2)), None)))
        for m in re.finditer(r"\b(\d{1,2}|" + "|".join(NUMBERS) + r")\s*(am|pm|o'?clock)\b", text):
            h = NUMBERS.get(m.group(1)) or int(m.group(1))
            found.append((m.start(), self._clock(h, 0, m.group(2))))
        for m in re.finditer(r"\bhalf past (\d{1,2}|" + "|".join(NUMBERS) + r")\b", text):
            h = NUMBERS.get(m.group(1)) or int(m.group(1))
            found.append((m.start(), self._clock(h, 30, None)))
        taken = {pos for pos, _ in found}
        for m in re.finditer(r"\b(?:at|around|about|by|until|till|after|before|since)\s+(\d{1,2}|"
                             + "|".join(NUMBERS) + r")\b(?![:.]\d)(?!\s*(?:am|pm|o'?clock))", text):
            if m.start(1) not in taken:  # "did she leave at nine?"
                h = NUMBERS.get(m.group(1)) or int(m.group(1))
                found.append((m.start(1), self._clock(h, 0, None)))
        if "midnight" in text:
            found.append((text.index("midnight"), 1440))
        return found

    @staticmethod
    def _clock(h: int, m: int, suffix: str | None) -> int:
        if suffix == "am" or (suffix is None and h <= 7):
            return (24 + h % 12) * 60 + m  # the morning after
        if h < 12:
            h += 12  # "nine", "9:30": the night of the murder
        return h * 60 + m
