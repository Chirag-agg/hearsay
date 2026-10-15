// HEARSAY, the game: title -> briefing -> the village by day -> (accusation) -> the flashback.
// Click a villager to walk over and question them; follow rumors from mouth to mouth; pin
// evidence in the notebook; send for the inspector; accuse.

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, hhmm, type Answer, type DetectiveStep, type GameEvent, type GodClaim, type Status, type Village } from "../api";
import QueryMonitor from "../components/QueryMonitor";
import Accusation from "./Accusation";
import { Portrait } from "./characters";
import Dialogue, { type Follow } from "./Dialogue";
import Flashback from "./Flashback";
import { ActionBar, Watch, Whispers } from "./Hud";
import InspectorLog from "./InspectorLog";
import Notebook from "./Notebook";
import Scene, { type Bubble, type Point } from "./Scene";
import { Briefing, Title } from "./Title";
import { PLACES, PLAYER_HOME, STANDS, skyAt } from "./world";

type Mode = "title" | "briefing" | "play" | "flashback";
const STORE = "hearsay.game";

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};

const beside = (id: string): Point => {
  const s = STANDS[id];
  return { x: s.x + (s.x > 800 ? -58 : 58), y: s.y + 8 };
};

export default function Game() {
  const [mode, setMode] = useState<Mode>("title");
  const [g, setG] = useState<string | null>(() => store.get(STORE));
  const [status, setStatus] = useState<Status | null>(null);
  const [village, setVillage] = useState<Village | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [player, setPlayer] = useState<Point>(PLAYER_HOME);
  const [talkingTo, setTalkingTo] = useState<string | null>(null);
  const [follow, setFollow] = useState<Follow | null>(null);

  const [feed, setFeed] = useState<GameEvent[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [version, setVersion] = useState(0);
  const seq = useRef(0);

  const [notebook, setNotebook] = useState<{ open: boolean; claim?: string | null }>({ open: false });
  const [accusing, setAccusing] = useState(false);
  const [lens, setLens] = useState(false);
  const [minds, setMinds] = useState<Record<string, { claims: GodClaim[]; heard: number; mutated: number }> | null>(null);
  const [mindOf, setMindOf] = useState<string | null>(null);
  const [inspector, setInspector] = useState<{ at: Point; running: boolean; result: { mode: string; steps: DetectiveStep[]; report: string } | null; open: boolean } | null>(null);
  const [hint, setHint] = useState(true);

  const names = useMemo(() => Object.fromEntries((village?.people ?? []).map((p) => [p.id, p.name])), [village]);
  const roles = useMemo(() => Object.fromEntries((village?.people ?? []).map((p) => [p.id, p.role])), [village]);

  // ---------------------------------------------------------------- game lifecycle
  const load = useCallback(async (id: string) => {
    const [s, v, past] = await Promise.all([api.status(id), api.village(id), api.events(id, 0).catch(() => ({ events: [] }))]);
    setStatus(s);
    setVillage(v);
    // Resume after what already happened: show it in the whispers, but don't replay its gossip.
    seq.current = past.events.length ? past.events[past.events.length - 1].seq + 1 : 0;
    setFeed([...past.events].reverse().slice(0, 40));
    try {
      setAnswers(JSON.parse(store.get(`${STORE}.${id}.answers`) ?? "[]"));
    } catch {
      setAnswers([]);
    }
  }, []);

  const newGame = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api.newGame();
      store.set(STORE, s.game_id);
      setG(s.game_id);
      setFeed([]);
      setAnswers([]);
      setPlayer(PLAYER_HOME);
      setInspector(null);
      setHint(true);
      await load(s.game_id);
      setMode("briefing");
    } catch (e) {
      setError(`Couldn't reach the village (${String(e)}). Is the backend running?`);
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!g) return;
    setBusy(true);
    setError(null);
    try {
      await load(g);
      setHint(false);
      setMode("play");
    } catch {
      store.set(STORE, null);
      setG(null);
      setError("That case has been closed (the game was cleared). Start a new one.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // only once the game has loaded, or the empty list on mount would overwrite the saved notes
    if (g && status) store.set(`${STORE}.${g}.answers`, JSON.stringify(answers.slice(-60)));
  }, [g, status, answers]);

  // ---------------------------------------------------------------- live events: gossip bubbles, whispers
  useEffect(() => {
    if (!g || mode !== "play") return;
    const timer = setInterval(async () => {
      try {
        const { events } = await api.events(g, seq.current);
        if (!events.length) return;
        seq.current = events[events.length - 1].seq + 1;
        setFeed((f) => [...[...events].reverse(), ...f].slice(0, 40));
        const pairs = events.filter((e) => e.type === "rumor_spread").flatMap((e) => (e.pairs as string[][]) ?? []);
        if (pairs.length) {
          const shown = pairs.filter(([a, b]) => STANDS[a] && STANDS[b]).slice(0, 9);
          const fresh = shown.map(([a, b], i) => ({ id: `${events[0].seq}-${a}-${b}`, from: STANDS[a], to: STANDS[b], delay: i * 0.35 }));
          setBubbles((bs) => [...bs, ...fresh]);
          setTimeout(() => setBubbles((bs) => bs.filter((b) => !fresh.includes(b))), 2600 + fresh.length * 350 + 400);
        }
        const steps = events.filter((e) => e.type === "detective_step");
        const last = steps[steps.length - 1];
        if (last) {
          const vid = (last.args as Record<string, unknown> | undefined)?.villager_id;
          setInspector((ins) => ins && { ...ins, at: typeof vid === "string" && STANDS[vid] ? beside(vid) : { x: PLACES.square.x + 60, y: PLACES.square.y + 70 } });
        }
        if (events.some((e) => e.type === "clock_tick" || e.type === "detective_done")) {
          api.status(g).then(setStatus).catch(() => undefined);
          setVersion((v) => v + 1);
        }
      } catch {
        /* backend busy */
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [g, mode]);

  // ---------------------------------------------------------------- walking and talking
  const headingRef = useRef<string | null>(null);
  const arrive = useCallback(() => {
    const id = headingRef.current;
    if (!id) return;
    headingRef.current = null;
    setTalkingTo(id);
  }, []);

  const walkTo = (id: string) => {
    setHint(false);
    setTalkingTo(null);
    const target = beside(id);
    headingRef.current = id;
    const dist = Math.hypot(target.x - player.x, target.y - player.y);
    if (dist < 3) {
      arrive();
      return;
    }
    setPlayer(target);
    // Fallback in case animation frames stall (a background tab): arrive when the walk should be over.
    window.setTimeout(() => headingRef.current === id && arrive(), (dist / 220) * 1000 + 600);
  };

  const onVillager = (id: string) => {
    if (minds) {
      setMindOf(id);
      return;
    }
    setFollow(null);
    walkTo(id);
  };

  const onFollow = (f: Follow) => {
    setFollow(f);
    walkTo(f.villager);
  };

  const sendInspector = async () => {
    if (!g || inspector?.running) return;
    setInspector({ at: { x: 30, y: 470 }, running: true, result: null, open: true });
    setTimeout(() => setInspector((ins) => ins && { ...ins, at: { x: PLACES.square.x + 60, y: PLACES.square.y + 70 } }), 50);
    try {
      const result = await api.detective(g);
      setInspector((ins) => ins && { ...ins, running: false, result, at: { x: PLACES.square.x + 60, y: PLACES.square.y + 70 } });
      const s = await api.status(g);
      setStatus(s);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(String(e));
      setInspector((ins) => ins && { ...ins, running: false });
    }
  };

  const toggleMinds = async () => {
    if (minds) {
      setMinds(null);
      setMindOf(null);
      return;
    }
    if (!g) return;
    try {
      setMinds(await api.god(g));
    } catch (e) {
      setError(String(e));
    }
  };

  const nextDay = async () => {
    if (!g) return;
    setStatus(await api.newSession(g));
  };

  // ---------------------------------------------------------------- render
  if (mode === "title" || !g || !status || !village) {
    return <Title canContinue={!!g} busy={busy} error={error} onNew={newGame} onContinue={resume} />;
  }

  const progress = Math.min(1, status.questions_asked / Math.max(1, status.questions_asked + status.questions_left));
  const sky = skyAt(progress);
  const hub = village.gossip_hubs[0]?.id;
  const villagers = Object.keys(STANDS).map((id) => ({
    id, name: names[id] ?? id, at: STANDS[id], talking: talkingTo === id,
    facing: (talkingTo === id && player.x < STANDS[id].x ? -1 : 1) as 1 | -1,
  }));
  const mindCounts = minds && Object.fromEntries(Object.entries(minds).map(([id, m]) => [id, { beliefs: m.claims.length, heard: m.heard, mutated: m.mutated }]));

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0">
        <Scene sky={sky} villagers={villagers} hub={hub} player={player} bubbles={bubbles} minds={mindCounts}
          inspector={inspector?.at ?? null}
          onVillager={onVillager}
          onArrive={arrive}
          interactive={mode === "play" && !accusing} />
      </div>

      {mode === "play" && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-3 top-3 flex flex-col gap-2">
            <Watch status={status} />
            <div className="pointer-events-auto flex gap-2">
              <button className="wood text-[13px]" onClick={() => setMode("title")}>☰ Menu</button>
              {status.questions_left === 0 && <button className="wood text-[13px]" onClick={nextDay}>☾ Return tomorrow</button>}
            </div>
          </div>
          <div className="absolute right-3 top-3 max-w-[70vw]">
            <ActionBar onNotebook={() => setNotebook({ open: true })} onInspector={() => (inspector?.running ? setInspector({ ...inspector, open: true }) : sendInspector())}
              onMinds={toggleMinds} onLens={() => setLens(!lens)} onAccuse={() => setAccusing(true)}
              minds={!!minds} lens={lens} inspectorBusy={!!inspector?.running} />
          </div>
          {!talkingTo && (
            <div className="absolute bottom-3 left-3">
              <Whispers feed={feed} names={names} />
            </div>
          )}
          <AnimatePresence>
            {hint && !talkingTo && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="parchment pointer-events-auto absolute left-1/2 top-24 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 p-4 text-center">
                <p className="font-display text-lg">Click a villager to walk over and question them.</p>
                <p className="mt-1 text-[13px] text-[#6b5040]">
                  Village talk (PageRank over who knows whom) says <b>{names[hub ?? ""]}</b> hears everything. Start there.
                </p>
                <button className="wood mt-2" onClick={() => setHint(false)}>Understood</button>
              </motion.div>
            )}
          </AnimatePresence>
          {minds && (
            <div className="parchment pointer-events-auto absolute bottom-3 left-1/2 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 p-3 text-center text-[13px]">
              <b>Mind's eye:</b> each villager's own memory graph. Click someone to read their mind. (Demo view: the player never sees this.)
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {talkingTo && mode === "play" && (
          <Dialogue key={talkingTo} g={g} villager={talkingTo} name={names[talkingTo]} role={roles[talkingTo]}
            questionsLeft={status.questions_left} statements={answers} pending={follow}
            onAnswer={(a) => {
              setAnswers((xs) => [...xs, a]);
              setStatus(a.status);
              setFollow(null);
              setVersion((v) => v + 1);
            }}
            onFollow={onFollow}
            onLeave={() => { setTalkingTo(null); setFollow(null); }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notebook.open && (
          <Notebook g={g} answers={answers} names={names} version={version} focusClaim={notebook.claim}
            onClose={() => setNotebook({ open: false })} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inspector?.open && (
          <InspectorLog live={feed.filter((e) => e.type === "detective_step").slice().reverse()} result={inspector.result}
            running={inspector.running} onClose={() => setInspector({ ...inspector, open: false })} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mindOf && minds?.[mindOf] && (
          <motion.aside initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className="parchment absolute bottom-3 left-3 top-36 z-30 flex w-[min(420px,calc(100vw-24px))] flex-col">
            <div className="flex items-center gap-3 border-b border-[#c9ae7c] p-3">
              <Portrait who={mindOf} size={56} />
              <div className="flex-1">
                <div className="font-display text-lg">Inside {names[mindOf]}'s mind</div>
                <div className="text-[12px] text-[#6b5040]">game_…_npc_{mindOf}: {minds[mindOf].claims.length} beliefs</div>
              </div>
              <button className="wood" onClick={() => setMindOf(null)}>Close</button>
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-auto p-3 text-[12.5px]">
              {minds[mindOf].claims.map((c) => (
                <li key={c.id} className={`rounded px-2 py-1 ${c.origin === "lie" ? "bg-[#c2412d]/15" : c.origin === "heard" ? "bg-[#5b8fa8]/15" : "bg-[#e8a33d]/15"}`}>
                  {belief(c)} <span className="text-[#6b5040]">{hhmm(c.t_to - c.t_from === 10 ? c.t_from + 5 : c.t_from)}</span>
                  {c.heard_from && <span className="text-[#2d5f78]"> · from {names[c.heard_from]?.split(" ")[0]}</span>}
                  {c.mutated && <span className="text-[#9a2f1f]"> · {c.mutated === "t" ? "time" : c.mutated} changed</span>}
                  {c.secret && <span className="text-[#9a6420]"> · secret</span>}
                  {c.origin === "lie" && <span className="font-bold text-[#9a2f1f]"> · lie</span>}
                </li>
              ))}
            </ul>
          </motion.aside>
        )}
      </AnimatePresence>

      {lens && <div className="absolute inset-0 z-30 pointer-events-none"><div className="pointer-events-auto"><QueryMonitor onClose={() => setLens(false)} /></div></div>}

      <AnimatePresence>
        {accusing && (
          <Accusation g={g} answers={answers} names={names}
            onVerdict={() => { setAccusing(false); setMode("flashback"); }}
            onClose={() => setAccusing(false)} />
        )}
      </AnimatePresence>

      {mode === "briefing" && <Briefing onStart={() => setMode("play")} />}
      {mode === "flashback" && <Flashback g={g} onDone={() => setMode("play")} />}

      {error && mode === "play" && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-lg bg-[#9a2f1f] px-4 py-2 text-sm text-white shadow-xl">
          {error} <button className="ml-2 font-bold" onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
}

const VERBS: Record<string, string> = {
  WAS_AT: "was", LEFT: "left", CARRIED: "carried", ARGUED_WITH: "argued with", THREATENED: "threatened", OWES: "owes", SAW: "saw",
};

/** One belief as a sentence: "Jonas Reed argued with Silas Crane at the Tavern". */
function belief(c: GodClaim): string {
  if (c.pred === "ASKED") return c.note ?? "the detective has been asking questions";
  const verb = VERBS[c.pred] ?? c.pred.toLowerCase();
  const what = c.pred === "OWES" ? ` ${c.object ?? ""}${c.crowns ? ` ${c.crowns} crowns` : ""}` : c.object ? ` ${c.object}` : "";
  const where = c.place ? (c.pred === "LEFT" ? ` the ${c.place}` : ` at the ${c.place}`) : "";
  return `${c.about ?? "someone"} ${verb}${what}${where}`;
}
