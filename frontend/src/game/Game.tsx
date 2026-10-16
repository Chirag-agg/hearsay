// HEARSAY, the game: title -> briefing -> the village by day -> (accusation) -> the flashback.
// Click a villager to walk over and question them; follow rumors from mouth to mouth; pin
// evidence in the notebook; send for the inspector; accuse.
//
// Keys: M sound, N notebook, Esc close or leave, 1-4 pick a question in a conversation.

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, hhmm, type Answer, type DetectiveStep, type GameEvent, type GodClaim, type Status, type Verdict, type Village } from "../api";
import QueryMonitor from "../components/QueryMonitor";
import Accusation from "./Accusation";
import { sound } from "./audio";
import { Portrait, type Dir } from "./characters";
import Dialogue, { type Follow } from "./Dialogue";
import Flashback from "./Flashback";
import { ActionBar, Watch, Whispers } from "./Hud";
import InspectorLog from "./InspectorLog";
import Notebook from "./Notebook";
import { CaseFile, ChapterCard, MILESTONES, MilestoneBanner, caseSteps, currentStep, milestonesFor, type Milestone } from "./quests";
import Scene, { type Actor, type Bubble, type Point } from "./Scene";
import { Briefing, HowToPlay, Title } from "./Title";
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
  return { x: s.x + (s.x > 800 ? -34 : 34), y: s.y + 6 };
};

function useMuted() {
  const [muted, setMuted] = useState(sound.muted);
  useEffect(() => sound.onChange(setMuted), []);
  return muted;
}

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
  const [thinking, setThinking] = useState(false);
  const [follow, setFollow] = useState<Follow | null>(null);
  const [pendingSource, setPendingSource] = useState<{ id: string; name: string } | null>(null);

  const [feed, setFeed] = useState<GameEvent[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [emotes, setEmotes] = useState<Record<string, string>>({});
  const [glance, setGlance] = useState<Record<string, Dir>>({});
  const [grudges, setGrudges] = useState<Set<string>>(new Set()); // villagers whose trust in you dropped
  const [version, setVersion] = useState(0);
  const seq = useRef(0);

  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<Milestone | null>(null);
  const bannerQueue = useRef<Milestone[]>([]);
  const [chapter, setChapter] = useState<number | null>(null);
  const [howto, setHowto] = useState(false);

  const [notebook, setNotebook] = useState<{ open: boolean; claim?: string | null }>({ open: false });
  const [accusing, setAccusing] = useState(false);
  const [lens, setLens] = useState(false);
  const [minds, setMinds] = useState<Record<string, { claims: GodClaim[]; heard: number; mutated: number }> | null>(null);
  const [mindOf, setMindOf] = useState<string | null>(null);
  const [inspector, setInspector] = useState<{ at: Point; running: boolean; result: { mode: string; steps: DetectiveStep[]; report: string } | null; open: boolean } | null>(null);
  const muted = useMuted();

  const names = useMemo(() => Object.fromEntries((village?.people ?? []).map((p) => [p.id, p.name])), [village]);
  const roles = useMemo(() => Object.fromEntries((village?.people ?? []).map((p) => [p.id, p.role])), [village]);
  const hub = village?.gossip_hubs[0]?.id;

  // ---------------------------------------------------------------- milestones and emotes
  const showNextBanner = useCallback(() => {
    const next = bannerQueue.current.shift() ?? null;
    setBanner(next);
    if (next) {
      sound.chime();
      window.setTimeout(showNextBanner, 3400);
    }
  }, []);

  const unlock = useCallback((ids: string[]) => {
    setUnlocked((u) => {
      const fresh = ids.filter((id) => !u.has(id) && MILESTONES[id]);
      if (!fresh.length) return u;
      const next = new Set([...u, ...fresh]);
      if (g) store.set(`${STORE}.${g}.milestones`, JSON.stringify([...next]));
      const idle = bannerQueue.current.length === 0;
      bannerQueue.current.push(...fresh.map((id) => MILESTONES[id]));
      if (idle) window.setTimeout(showNextBanner, 300);
      return next;
    });
  }, [g, showNextBanner]);

  const emote = useCallback((id: string, e: string, ms = 2800) => {
    setEmotes((m) => ({ ...m, [id]: e }));
    window.setTimeout(() => setEmotes((m) => {
      if (m[id] !== e) return m;
      const { [id]: _, ...rest } = m;
      return rest;
    }), ms);
  }, []);

  // Villagers glance around now and then.
  useEffect(() => {
    if (mode !== "play") return;
    const t = window.setInterval(() => {
      const ids = Object.keys(STANDS);
      const id = ids[Math.floor(Math.random() * ids.length)];
      setGlance((gl) => ({ ...gl, [id]: (["down", "down", "left", "right"] as Dir[])[Math.floor(Math.random() * 4)] }));
    }, 2600);
    return () => window.clearInterval(t);
  }, [mode]);

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
      setUnlocked(new Set(JSON.parse(store.get(`${STORE}.${id}.milestones`) ?? "[]")));
    } catch {
      setAnswers([]);
      setUnlocked(new Set());
    }
  }, []);

  const newGame = async () => {
    setBusy(true);
    setError(null);
    sound.setMuted(false); // the click is the user gesture browsers need for sound
    try {
      const s = await api.newGame();
      store.set(STORE, s.game_id);
      setG(s.game_id);
      setFeed([]);
      setAnswers([]);
      setUnlocked(new Set());
      setGrudges(new Set());
      setPendingSource(null);
      setPlayer(PLAYER_HOME);
      setInspector(null);
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
    sound.setMuted(false);
    try {
      await load(g);
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

  useEffect(() => {
    sound.setScene(mode === "play" ? "day" : "night");
  }, [mode]);

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
          const fresh = shown.map(([a, b], i) => ({ id: `${events[0].seq}-${i}-${a}-${b}`, from: STANDS[a], to: STANDS[b], delay: i * 0.35 }));
          setBubbles((bs) => [...bs, ...fresh]);
          shown.forEach(([a], i) => window.setTimeout(() => emote(a, "💬", 1600), i * 350));
          setTimeout(() => setBubbles((bs) => bs.filter((b) => !fresh.includes(b))), 2600 + fresh.length * 350 + 400);
        }
        events.filter((e) => e.type === "mood_changed").forEach((e) => emote(String(e.villager), "😠", 4000));
        const steps = events.filter((e) => e.type === "detective_step");
        const last = steps[steps.length - 1];
        if (last) {
          const vid = (last.args as Record<string, unknown> | undefined)?.villager_id;
          setInspector((ins) => ins && { ...ins, at: typeof vid === "string" && STANDS[vid] ? beside(vid) : { x: PLACES.square.x - 40, y: PLACES.square.y + 56 } });
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
  }, [g, mode, emote]);

  // ---------------------------------------------------------------- walking and talking
  const headingRef = useRef<string | null>(null);
  const arrive = useCallback(() => {
    const id = headingRef.current;
    if (!id) return;
    headingRef.current = null;
    setTalkingTo(id);
  }, []);

  const walkTo = (id: string) => {
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
    sound.click();
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

  const onAnswer = (a: Answer, followed: boolean) => {
    setAnswers((xs) => [...xs, a]);
    setStatus(a.status);
    setFollow(null);
    setVersion((v) => v + 1);
    if (pendingSource?.id === a.villager) setPendingSource(null);
    if (a.events.some((e) => e.type === "mood_changed")) {
      setGrudges((gr) => new Set([...gr, a.villager]));
      emote(a.villager, "😠", 4000);
    }
    if (a.contradictions_new.length) {
      sound.sting();
      emote(a.villager, "❗", 3500);
    }
    unlock(milestonesFor(a, { hub, followed }));
  };

  const sendInspector = async () => {
    if (!g || inspector?.running) return;
    setInspector({ at: { x: 30, y: 470 }, running: true, result: null, open: true });
    setTimeout(() => setInspector((ins) => ins && { ...ins, at: { x: PLACES.square.x - 40, y: PLACES.square.y + 56 } }), 50);
    try {
      const result = await api.detective(g);
      setInspector((ins) => ins && { ...ins, running: false, result, at: { x: PLACES.square.x - 40, y: PLACES.square.y + 56 } });
      const s = await api.status(g);
      setStatus(s);
      setVersion((v) => v + 1);
      sound.chime();
    } catch (e) {
      setError(String(e));
      setInspector((ins) => ins && { ...ins, running: false });
    }
  };

  const toggleMinds = async () => {
    sound.whoosh();
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
    const s = await api.newSession(g);
    setStatus(s);
    setChapter(s.session);
  };

  const openNotebook = () => {
    sound.paper();
    setNotebook({ open: true });
  };

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        if (notebook.open) setNotebook({ open: false });
        else if (accusing) setAccusing(false);
        else if (mindOf) setMindOf(null);
        else if (lens) setLens(false);
        else if (talkingTo) { setTalkingTo(null); setFollow(null); }
        return;
      }
      if (typing || mode !== "play") return;
      if (e.key === "m" || e.key === "M") sound.toggle();
      if ((e.key === "n" || e.key === "N") && !talkingTo) openNotebook();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- render
  if (mode === "title" || !g || !status || !village) {
    return <Title canContinue={!!g} busy={busy} error={error} onNew={newGame} onContinue={resume} />;
  }

  const progress = Math.min(1, status.questions_asked / Math.max(1, status.questions_asked + status.questions_left));
  const sky = skyAt(progress);
  const steps = caseSteps(answers, unlocked, hub, names, pendingSource);
  const obj = currentStep(steps);
  const villagers: Actor[] = Object.keys(STANDS).map((id) => ({
    id, name: names[id] ?? id, at: STANDS[id], talking: talkingTo === id,
    thinking: talkingTo === id && thinking,
    marker: !talkingTo && !minds && obj.targets.includes(id),
    emote: emotes[id],
    mood: emotes[id] === "❗" ? "worried" : grudges.has(id) || emotes[id] === "😠" ? "angry" : undefined,
    dir: talkingTo === id ? (player.x < STANDS[id].x ? "left" : "right") : glance[id] ?? "down",
  }));
  const mindCounts = minds && Object.fromEntries(Object.entries(minds).map(([id, m]) => [id, { beliefs: m.claims.length, heard: m.heard, mutated: m.mutated }]));
  const focus = talkingTo ? { x: (player.x + STANDS[talkingTo].x) / 2, y: STANDS[talkingTo].y } : null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0">
        <Scene sky={sky} villagers={villagers} hub={hub} player={player} bubbles={bubbles} minds={mindCounts}
          playerDir={talkingTo ? (player.x < STANDS[talkingTo].x ? "right" : "left") : undefined}
          inspector={inspector?.at ?? null}
          onVillager={onVillager}
          onArrive={arrive}
          focus={mode === "play" ? focus : null}
          interactive={mode === "play" && !accusing} />
      </div>

      {mode === "play" && (
        <div className="pointer-events-none absolute inset-0">
          <AnimatePresence>
            {!talkingTo && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="absolute left-3 top-3 flex flex-col gap-2">
                <Watch status={status} />
                <CaseFile steps={steps} names={names} onGo={onVillager} onAccuse={() => { sound.click(); setAccusing(true); }} />
                <div className="pointer-events-auto flex gap-2">
                  <button className="wood text-[13px]" onClick={() => setMode("title")}>☰ Menu</button>
                  <button className="wood text-[13px]" onClick={() => setHowto(true)}>? How to play</button>
                  {status.questions_left === 0 && <button className="wood text-[13px]" onClick={nextDay}>☾ Return tomorrow</button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="absolute right-3 top-3 max-w-[70vw]">
            <ActionBar onNotebook={openNotebook} onInspector={() => (inspector?.running ? setInspector({ ...inspector, open: true }) : sendInspector())}
              onMinds={toggleMinds} onLens={() => { sound.click(); setLens(!lens); }} onAccuse={() => { sound.click(); setAccusing(true); }}
              onSound={() => sound.toggle()} muted={muted}
              minds={!!minds} lens={lens} inspectorBusy={!!inspector?.running} />
          </div>
          {!talkingTo && (
            <div className="absolute bottom-3 left-3">
              <Whispers feed={feed} names={names} />
            </div>
          )}
          {!talkingTo && !minds && (
            <div className="absolute bottom-3 right-3 hidden rounded-lg bg-[#1c1714]/70 px-3 py-1.5 text-[11px] text-[#cbb89a] backdrop-blur md:block">
              <span className="text-[#ffd27a]">◯</span> gold ring: someone you can question · drag or arrows to look around · wheel, pinch or <b>+</b>/<b>−</b> to zoom · <b>N</b> notebook
            </div>
          )}
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
            onAnswer={onAnswer}
            onThinking={setThinking}
            onSource={(s) => {
              unlock(["told"]);
              if (s.source && s.source_name) setPendingSource({ id: s.source, name: s.source_name });
            }}
            onFollow={onFollow}
            outerMood={grudges.has(talkingTo) ? "angry" : undefined}
            onLeave={() => { setTalkingTo(null); setFollow(null); }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notebook.open && (
          <Notebook g={g} answers={answers} names={names} version={version} focusClaim={notebook.claim}
            onClose={() => { sound.paper(); setNotebook({ open: false }); }} />
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

      {lens && <div className="pointer-events-none absolute inset-0 z-30"><div className="pointer-events-auto"><QueryMonitor onClose={() => setLens(false)} /></div></div>}

      <AnimatePresence>
        {accusing && (
          <Accusation g={g} answers={answers} names={names}
            onVerdict={(v: Verdict) => {
              if (v.correct) unlock(["closed"]);
              setAccusing(false);
              sound.whoosh();
              setMode("flashback");
            }}
            onClose={() => setAccusing(false)} />
        )}
      </AnimatePresence>

      {mode === "briefing" && <Briefing onStart={() => { sound.whoosh(); setMode("play"); setHowto(true); }} />}
      {howto && mode === "play" && <HowToPlay onDone={() => { sound.click(); setHowto(false); if (status.session === 1 && answers.length === 0) setChapter(status.session); }} />}
      {mode === "flashback" && (
        <motion.div className="absolute inset-0 z-50" initial={{ clipPath: "circle(0% at 50% 50%)" }}
          animate={{ clipPath: "circle(150% at 50% 50%)" }} transition={{ duration: 1.4, ease: [0.6, 0, 0.3, 1] }}>
          <Flashback g={g} onDone={() => setMode("play")} />
        </motion.div>
      )}
      {chapter !== null && mode === "play" && <ChapterCard day={chapter} onDone={() => setChapter(null)} />}

      <MilestoneBanner m={banner} />

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
