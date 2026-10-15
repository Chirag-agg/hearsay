"""The detective agent: plan, act, observe, capped at max_steps, through the hearsay-graph MCP server.

It connects to our own MCP server over stdio and only knows what the tools return, so it can
never read the truth graph. With an LLM configured (and REPLAY != 1) the model picks the tools;
otherwise a scripted detective follows the case the way the doc's solving path does, through the
same MCP tools, so the demo is identical on every run. Either way each step is published as a
detective_step event (tool, arguments, Cypher, one-line result), and the run ends with a Handoff
node on the case board that the player sees when they come back.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from app import db, events, games
from app.npc import llm

SERVER = Path(__file__).resolve().parents[2] / "mcp_server" / "server.py"
RESULT_CHARS = 2500


class Detective:
    def __init__(self, session, g: str, max_steps: int):
        self.session, self.g, self.max_steps = session, g, max_steps
        self.steps: list[dict] = []
        self.statements: dict[str, str] = {}  # villager -> latest statement id

    async def call(self, tool: str, why: str, **args) -> dict:
        if len(self.steps) >= self.max_steps:
            raise StopIteration("step budget used")
        result = await self.session.call_tool(tool, {"game_id": self.g, **args})
        text = result.content[0].text if result.content else ""
        if _field(result, "is_error", "isError"):  # a failed tool is a result to reason about, not a crash
            data = {"error": text or "tool error"}
        else:
            structured = _field(result, "structured_content", "structuredContent")
            try:
                data = structured if structured else json.loads(text) if text else {}
            except json.JSONDecodeError:
                data = {"error": text}
        cypher = data.pop("cypher", []) if isinstance(data, dict) else []
        step = {"step": len(self.steps) + 1, "tool": tool, "args": args, "why": why,
                "cypher": cypher, "summary": summarize(tool, data)}
        self.steps.append(step)
        events.publish(self.g, [{"type": "detective_step", **{k: step[k] for k in ("step", "tool", "args", "why", "summary")},
                                 "cypher": [c["query"] for c in cypher]}])
        if tool == "interrogate" and isinstance(data, dict) and data.get("statement_id"):
            self.statements[args["villager_id"]] = data["statement_id"]
        return data


def _field(obj, *names):
    """mcp 2.x uses snake_case (input_schema, structured_content); 1.x used camelCase."""
    return next((getattr(obj, n) for n in names if getattr(obj, n, None) is not None), None)


def summarize(tool: str, d: dict) -> str:
    if not isinstance(d, dict) or "error" in d:
        return f"error: {d.get('error') if isinstance(d, dict) else d}"
    if tool == "gossip_hubs":
        return "hubs: " + ", ".join(f"{h['villager']} ({h['score']:.2f})" for h in d["hubs"])
    if tool == "interrogate":
        extra = f" | new contradiction: {'; '.join(d['new_contradictions'])}" if d["new_contradictions"] else ""
        return f"{d['villager']}: {d['dialogue']}{extra}"
    if tool == "who_told_you":
        return d.get("dialogue", "")
    if tool == "trace_rumor":
        return " -> ".join(f"{h['teller_name']}: {h['about']} at {h['place']} {h['time']}" for h in d["chain"])
    if tool == "find_contradictions":
        return "; ".join(f"{c['detail']} (implicates {c['implicates_name'] or 'nobody yet'})"
                         for c in d["contradictions"]) or "none yet"
    if tool == "suspects_fitting":
        return "fits, no confirmed alibi: " + ", ".join(s["suspect"] for s in d["suspects"])
    if tool == "score_suspects":
        return f"sighting '{d.get('sighting_text')}': " + ", ".join(f"{r['suspect']} {r['score']}" for r in d["ranking"][:3])
    if tool == "check_travel":
        r = d["result"] or {}
        return f"{r.get('minutes_needed')} min needed, {r.get('minutes_available')} available, possible: {r.get('possible')}"
    if tool == "accuse":
        return f"{d['summary']} (score {d['score']})"
    return json.dumps(d)[:200]


# ---------------------------------------------------------------- scripted detective (REPLAY=1)

async def scripted(det: Detective) -> str:
    """The doc's solving path, decided from tool results (claim ids, statements), not hard-coded ids.
    It reads the board first, so it can also finish a case the player or the LLM detective started."""
    hubs = await det.call("gossip_hubs", "Start where the gossip collects.")
    hub = hubs["hubs"][0]["villager"].split()[0].lower()
    board = (await det.call("case_summary", "Read what is already on the board."))["statements"]
    done = {(s["villager"], s["question"]): s["statement_id"] for s in board}

    async def interrogate(why, **kw):
        data = await det.call("interrogate", why, **kw)
        return None if "error" in data else data  # e.g. the day ran out

    async def ask(vid, q, why, **kw):
        if (vid, q) in done and not kw:  # the player or an earlier run already asked exactly this
            det.statements[vid] = done[(vid, q)]
            return None
        return await interrogate(why, villager_id=vid, question=q, **kw)

    tavern = await ask(hub, "Who was at the tavern last night?", "The barkeep saw who was in the Tavern.")
    mill = await interrogate("Has the gossip hub heard anything about the scene?",
                             villager_id=hub, question="Did you see anyone near the mill?")
    await ask("hale", "Who was at the tavern last night?", "A second Tavern witness, for the alibis.")
    await ask("imogen", "Who was at the tavern last night?", "A third Tavern witness, independent of the first two.")
    await ask("tilly", "Did you see Elena or Jonas at the smithy, and did Silas threaten anyone?",
              "The child sees things adults miss: the Smithy and the threat.")
    await ask("aldric", "When did Elena leave the chapel?", "Check Elena's whereabouts with the priest.")
    await ask("elena", "Where were you between 21:00 and 22:00?", "Elena's own account of the time of death.")
    await ask("jonas", "Where were you between 21:00 and 22:00?", "Jonas argued with Silas; where was he?")
    tavern_statement = tavern["statement_id"] if tavern else det.statements.get(hub)
    if tavern_statement:
        await interrogate("Bess saw Jonas head for the Manor; show Lady Wren that statement.",
                          villager_id="wren", question="Was Jonas with you last night?",
                          cite_statement_ids=[tavern_statement])
    await det.call("find_contradictions", "Which stories clash, and whose story is in doubt?")
    await det.call("score_suspects", "Rank the suspects on what the village believes now.")

    sighting = next((c for c in (mill or {}).get("claims", []) if "lantern" in (c["about"] or "")), None)
    origin = None
    claim = sighting["claim_id"] if sighting else None
    while claim:
        told = await det.call("who_told_you", "The sighting is hearsay: who told them?", claim_id=claim)
        if not told.get("source"):
            break
        answer = await interrogate(f"Ask {told['source_name']} for their own version.", villager_id=told["source"],
                                   question="Tell me about the person you heard about near the mill.",
                                   about_claim_id=claim)
        if not answer or not answer["claims"]:
            break
        claim = answer["claims"][0]["claim_id"]
        if answer["claims"][0]["reported_as"] == "saw":
            break
    if sighting:
        traced = await det.call("trace_rumor", "Show the whole chain and what changed.", claim_id=sighting["claim_id"])
        origin = traced["chain"][-1]
    await det.call("check_travel", "Could Elena reach the Mill after leaving the Chapel at 21:00?",
                   person_id="elena", from_place="chapel", from_time="21:00", to_place="mill", to_time="21:30")
    ranked = await det.call("score_suspects", "Re-rank with the sighting traced to its eyewitness.")
    top = ranked["ranking"][0]
    evidence = [det.statements[v] for v in ("tilly", "aldric", "elena", "pip") if v in det.statements]
    verdict = await det.call("accuse", f"{top['suspect']} leads on motive, means, a lie and the traced sighting.",
                             suspect_id=top["suspect_id"], statement_ids=evidence,
                             motive="She owed Silas 300 crowns and he threatened to take her shop")
    traced_note = (f" The scene sighting traced back to {origin['teller_name']}'s first-hand "
                   f"'{origin['about']}' at {origin['time']}." if origin else "")
    return f"Accused {top['suspect']} (score {top['score']}).{traced_note} {verdict.get('summary', '')}"


# ---------------------------------------------------------------- LLM detective

SYSTEM = """You are the detective in HEARSAY, a murder mystery. Silas Crane was found dead at the Old Mill;
time of death 21:00-22:00; the blacksmith's hammer is missing. You can only learn things through your tools.
Rumors mutate as they pass between villagers, so trace heard claims back to an eyewitness before trusting them
(who_told_you, then interrogate the source with about_claim_id). Each interrogation costs 30 minutes; you have
a limited budget. Call find_contradictions and score_suspects to reason, then call accuse with the suspect id,
the motive, and the statement ids that prove it. Explain each step in one sentence before calling a tool."""


def _tool_schema(t) -> dict:
    schema = json.loads(json.dumps(_field(t, "input_schema", "inputSchema")))
    schema.get("properties", {}).pop("game_id", None)
    if "required" in schema:
        schema["required"] = [r for r in schema["required"] if r != "game_id"]
    return {"type": "function", "function": {"name": t.name, "description": t.description or "", "parameters": schema}}


async def with_llm(det: Detective) -> tuple[str, bool]:
    """The model picks the tools. Returns (report, accused)."""
    tools = [_tool_schema(t) for t in (await det.session.list_tools()).tools]
    messages = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"Solve the case. You have {det.max_steps} tool calls."}]
    nudged = False
    while len(det.steps) < det.max_steps:
        body = {"model": os.environ["LLM_MODEL"], "messages": messages, "tools": tools, "temperature": 0.2}
        msg = llm.chat(body, retries=4, max_wait_s=30, timeout_s=60)  # the detective can wait out a rate limit
        messages.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
        calls = msg.get("tool_calls") or []
        if not calls:
            if nudged:
                return msg.get("content") or "The detective stopped.", False
            nudged = True
            messages.append({"role": "user", "content": "You have not accused anyone yet. Keep investigating with "
                                                        "the tools, then call accuse."})
            continue
        for c in calls:
            args = json.loads(c["function"]["arguments"] or "{}")
            args.pop("game_id", None)
            try:
                data = await det.call(c["function"]["name"], msg.get("content") or "", **args)
            except StopIteration:
                return "Out of steps.", False
            messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(data, default=str)[:RESULT_CHARS]})
            if c["function"]["name"] == "accuse" and "error" not in data:
                return f"Accused {args.get('suspect_id')}: {data.get('summary')}", True
    return "Out of steps.", False


# ---------------------------------------------------------------- entry point

FINISH_STEPS = 30  # extra tool calls the scripted detective gets to finish a case the LLM left open


def _server():
    """The hearsay-graph MCP server to talk to. In-process by default (still the MCP protocol, and
    its queries show in the live query monitor); DETECTIVE_TRANSPORT=stdio launches it as a subprocess."""
    from mcp import StdioServerParameters

    if os.getenv("DETECTIVE_TRANSPORT", "memory") == "stdio":
        return StdioServerParameters(command=sys.executable, args=[str(SERVER)], env={**os.environ},
                                     cwd=str(SERVER.parents[1]))
    sys.path.insert(0, str(SERVER.parents[1]))
    from mcp_server.server import mcp as server
    return server


async def _run(g: str, max_steps: int) -> dict:
    from mcp import Client

    async with Client(_server()) as session:
        det = Detective(session, g, max_steps)
        if os.getenv("REPLAY", "0") == "1" or not llm.configured():
            try:
                return {"mode": "scripted", "steps": det.steps, "report": await scripted(det)}
            except StopIteration:
                return {"mode": "scripted", "steps": det.steps, "report": "Out of steps."}
        try:
            report, accused = await with_llm(det)
            why = "it stopped without accusing"
        except Exception as exc:  # rate limits, bad tool JSON: the run must not be lost
            report, accused, why = f"LLM error: {exc}", False, f"LLM error: {str(exc)[:120]}"
        mode = "llm"
        if not accused:  # finish from the board as it stands
            mode = f"llm for {len(det.steps)} steps, then scripted ({why})"
            det.max_steps = len(det.steps) + FINISH_STEPS
            try:
                report = await scripted(det)
            except StopIteration:
                report = "Out of steps."
        return {"mode": mode, "steps": det.steps, "report": report}


def run_detective(g: str, max_steps: int = 30) -> dict:
    games.touch(g)
    out = asyncio.run(_run(g, max_steps))
    graph = db.game(g).case
    open_leads = db.run(graph, "q08b_leads")
    db.run_cypher(graph, "CREATE (:Handoff {summary: $s, open_leads: $n, steps: $k})",
                  {"s": out["report"], "n": len(open_leads), "k": len(out["steps"])}, label="detective handoff")
    events.publish(g, [{"type": "detective_done", "report": out["report"]}])
    return out
