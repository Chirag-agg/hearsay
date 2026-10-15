import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Answer, type GameEvent, type Status, type Village } from "./api";
import VillagePage from "./pages/Village";
import InterrogatePage from "./pages/Interrogate";
import CaseBoardPage from "./pages/CaseBoard";
import DetectivePage from "./pages/Detective";
import RevealPage from "./pages/Reveal";
import GodViewPage from "./pages/GodView";
import QueryMonitor from "./components/QueryMonitor";
import ErrorBoundary from "./components/ErrorBoundary";

const TABS = ["Village", "Interrogate", "Case board", "Detective", "Accuse", "God view"] as const;
type Tab = (typeof TABS)[number];
const STORE = "hearsay.game";

export type GameCtx = {
  g: string;
  status: Status;
  village: Village;
  answers: Answer[];
  addAnswer: (a: Answer) => void;
  refresh: () => void;
  goTo: (tab: Tab, focus?: { claimId?: string; villager?: string }) => void;
  focus: { claimId?: string; villager?: string };
  version: number;
};

export default function App() {
  const [g, setG] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORE);
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<Status | null>(null);
  const [village, setVillage] = useState<Village | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [tab, setTab] = useState<Tab>("Village");
  const [focus, setFocus] = useState<GameCtx["focus"]>({});
  const [feed, setFeed] = useState<GameEvent[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const seq = useRef(0);

  const remember = (id: string | null) => {
    try {
      if (id) localStorage.setItem(STORE, id);
      else localStorage.removeItem(STORE);
    } catch {
      /* private mode */
    }
  };

  const load = useCallback(async (id: string) => {
    try {
      const [s, v] = await Promise.all([api.status(id), api.village(id)]);
      setStatus(s);
      setVillage(v);
      setError(null);
    } catch (e) {
      setError(String(e));
      setG(null);
      remember(null);
    }
  }, []);

  useEffect(() => {
    if (g) load(g);
  }, [g, load]);

  // Live events: contradiction_found, rumor_spread, clock_tick, mood_changed, detective_step.
  useEffect(() => {
    if (!g) return;
    seq.current = 0;
    const timer = setInterval(async () => {
      try {
        const { events } = await api.events(g, seq.current);
        if (events.length) {
          seq.current = events[events.length - 1].seq + 1;
          setFeed((f) => [...events.reverse(), ...f].slice(0, 40));
          if (events.some((e) => e.type === "clock_tick" || e.type === "detective_done")) {
            api.status(g).then(setStatus).catch(() => undefined);
            setVersion((v) => v + 1);
          }
        }
      } catch {
        /* backend restarting */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [g]);

  const start = async () => {
    setBusy(true);
    try {
      const s = await api.newGame();
      remember(s.game_id);
      setAnswers([]);
      setFeed([]);
      setG(s.game_id);
      setTab("Village");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const comeBack = async () => {
    if (!g) return;
    setStatus(await api.newSession(g));
  };

  if (!g || !status || !village) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
        <div>
          <h1 className="font-display text-6xl tracking-wide text-lantern sm:text-7xl">HEARSAY</h1>
          <p className="mt-3 font-display text-xl italic text-muted">A village that remembers. A graph that never lies.</p>
        </div>
        <div className="card max-w-lg p-5 text-left text-sm leading-relaxed text-parchment/90">
          Silas Crane, the moneylender, is found dead at the Old Mill at 06:00. The physician puts the time of death
          between 21:00 and 22:00. The blacksmith's hammer is missing. You have one day, 08:00 to 16:00: every question
          costs 30 minutes, and the village keeps gossiping while you ask.
        </div>
        <button className="btn-primary px-6 py-2.5 text-base" onClick={start} disabled={busy}>
          {busy ? "Opening the village…" : "Begin the investigation"}
        </button>
        {error && <p className="text-sm text-blood">{error}</p>}
      </div>
    );
  }

  const ctx: GameCtx = {
    g,
    status,
    village,
    answers,
    addAnswer: (a) => {
      setAnswers((xs) => [...xs, a]);
      setStatus(a.status);
      setVersion((v) => v + 1);
    },
    refresh: () => {
      api.status(g).then(setStatus);
      setVersion((v) => v + 1);
    },
    goTo: (t, f) => {
      setFocus(f ?? {});
      setTab(t);
    },
    focus,
    version,
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-edge bg-night/80 px-4 py-2.5">
        <span className="font-display text-2xl text-lantern">HEARSAY</span>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-sm ${tab === t ? "bg-lantern text-ink" : "text-muted hover:text-parchment"}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="font-mono text-lantern">{status.clock}</span>
          <span className="text-muted">
            {status.questions_left} question{status.questions_left === 1 ? "" : "s"} left · session {status.session}
          </span>
          <button className="btn" onClick={comeBack} title="Come back tomorrow: villagers remember you">
            New session
          </button>
          <button className="btn" onClick={() => setMonitor(!monitor)}>
            Queries
          </button>
          <button className="btn" onClick={start}>
            New game
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-4">
          <ErrorBoundary resetKey={tab}>
          {tab === "Village" && <VillagePage ctx={ctx} />}
          {tab === "Interrogate" && <InterrogatePage ctx={ctx} />}
          {tab === "Case board" && <CaseBoardPage ctx={ctx} />}
          {tab === "Detective" && <DetectivePage ctx={ctx} feed={feed} />}
          {tab === "Accuse" && <RevealPage ctx={ctx} />}
          {tab === "God view" && <GodViewPage ctx={ctx} />}
          </ErrorBoundary>
        </div>
        <aside className="hidden w-72 shrink-0 overflow-auto border-l border-edge bg-night/60 p-3 lg:block">
          <div className="label mb-2">Live events</div>
          <ul className="space-y-1.5 text-xs">
            {feed.length === 0 && <li className="text-muted">Nothing yet. Ask someone a question.</li>}
            {feed.map((e) => (
              <li key={e.seq} className="rounded-md bg-panel/70 px-2 py-1.5">
                <EventLine e={e} />
              </li>
            ))}
          </ul>
        </aside>
        {monitor && <QueryMonitor onClose={() => setMonitor(false)} />}
      </main>
    </div>
  );
}

function EventLine({ e }: { e: GameEvent }) {
  switch (e.type) {
    case "contradiction_found":
      return <span className="text-blood">Contradiction: {String(e.detail)}</span>;
    case "rumor_spread":
      return (
        <span className="text-muted">
          The village gossips: {String(e.hops)} retellings, {String(e.mutated)} changed on the way.
        </span>
      );
    case "clock_tick":
      return (
        <span className="text-muted">
          {String(e.clock)}: {String(e.questions_left)} questions left
        </span>
      );
    case "mood_changed":
      return (
        <span className="text-lantern">
          {String(e.villager)} trusts you less now ({Number(e.trust).toFixed(1)})
        </span>
      );
    case "detective_step":
      return (
        <span className="text-river">
          Detective · {String(e.tool)}: {String(e.summary).slice(0, 120)}
        </span>
      );
    case "detective_done":
      return <span className="text-moss">Detective: {String(e.report)}</span>;
    default:
      return <span>{e.type}</span>;
  }
}
