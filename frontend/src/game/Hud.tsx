// Heads-up display: pocket watch and candles (questions left), the action buttons, and the
// "village whispers" ticker fed by live events.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { GameEvent, Status } from "../api";

export function Watch({ status }: { status: Status }) {
  const [h, m] = status.clock.split(":").map(Number);
  const hourAngle = ((h % 12) + m / 60) * 30;
  const minuteAngle = m * 6;
  const total = status.questions_left + status.questions_asked;
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-[#1c1714]/80 px-3 py-2 shadow-xl backdrop-blur">
      <svg viewBox="-30 -34 60 64" width="52" height="56">
        <circle cx="0" cy="-30" r="4" fill="none" stroke="#c9a24a" strokeWidth="2.5" />
        <circle r="26" fill="#c9a24a" />
        <circle r="22" fill="#fbf3df" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="0" y1="-19" x2="0" y2="-16" stroke="#3a2a1e" strokeWidth="1.5" transform={`rotate(${i * 30})`} />
        ))}
        <line x1="0" y1="0" x2="0" y2="-11" stroke="#2a1d14" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${hourAngle})`} />
        <line x1="0" y1="0" x2="0" y2="-17" stroke="#2a1d14" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${minuteAngle})`} />
        <circle r="2" fill="#9a2f1f" />
      </svg>
      <div>
        <div className="font-mono text-xl leading-none text-[#ffd27a]">{status.clock}</div>
        <div className="mt-1 flex gap-[3px]" title={`${status.questions_left} questions left`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`block h-3 w-1.5 rounded-sm ${i < status.questions_left ? "bg-[#ffd27a] shadow-[0_0_6px_#ffb24a]" : "bg-[#5a4a3a]"}`} />
          ))}
        </div>
        <div className="mt-0.5 text-[11px] text-[#cbb89a]">
          {status.questions_left} questions left · day {status.session}
        </div>
      </div>
    </div>
  );
}

export function Whispers({ feed, names }: { feed: GameEvent[]; names: Record<string, string> }) {
  // Each whisper shows for a few seconds, two at most, so they don't pile up over the village.
  const seen = useRef(new Map<number, number>());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  feed.forEach((e) => { if (!seen.current.has(e.seq)) seen.current.set(e.seq, Date.now()); });
  const lasts = (e: GameEvent) => (e.type === "contradiction_found" || e.type === "detective_done" ? 14000 : 7000);
  const lines = feed.filter((e) => e.type !== "clock_tick" && e.type !== "detective_step")
    .filter((e) => now - (seen.current.get(e.seq) ?? now) < lasts(e)).slice(0, 2);
  return (
    <div className="pointer-events-none flex w-[min(380px,calc(100vw-24px))] flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {lines.map((e) => (
          <motion.div key={e.seq} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] shadow-lg backdrop-blur ${
              e.type === "contradiction_found" ? "bg-[#9a2f1f]/90 text-white" : "bg-[#1c1714]/80 text-[#efe6d4]"}`}>
            {describe(e, names)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function describe(e: GameEvent, names: Record<string, string>): string {
  switch (e.type) {
    case "contradiction_found":
      return `✗ ${String(e.detail)}`;
    case "rumor_spread": {
      const pairs = (e.pairs as string[][] | undefined) ?? [];
      const top = pairs.slice(0, 2).map(([a, b]) => `${first(names[a])} → ${first(names[b])}`).join(", ");
      return `The village gossips: ${String(e.hops)} retellings${top ? ` (${top}…)` : ""}`;
    }
    case "mood_changed":
      return `${names[String(e.villager)] ?? e.villager} trusts you less now.`;
    case "detective_done":
      return `Inspector Graves: ${String(e.report)}`;
    default:
      return e.type;
  }
}

const first = (n?: string) => (n ?? "").replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0];

export function ActionBar({ onNotebook, onInspector, onMinds, onLens, onAccuse, onSound, muted, minds, lens, inspectorBusy }: {
  onNotebook: () => void;
  onInspector: () => void;
  onMinds: () => void;
  onLens: () => void;
  onAccuse: () => void;
  onSound: () => void;
  muted: boolean;
  minds: boolean;
  lens: boolean;
  inspectorBusy: boolean;
}) {
  // Playing needs two buttons: your notes and the accusation. The rest shows how the game works inside.
  const [more, setMore] = useState(false);
  const pick = (fn: () => void) => () => { setMore(false); fn(); };
  return (
    <div className="pointer-events-auto relative flex flex-wrap justify-end gap-2">
      <button className="wood" onClick={onNotebook} title="Your case notes: evidence, suspects, rumor traces (N)">📜 Notebook</button>
      <button className="wood" onClick={onAccuse} title="Name the killer">⚖ Accuse</button>
      <button className={`wood ${more || minds || lens || inspectorBusy ? "wood-on" : ""}`} onClick={() => setMore(!more)} title="How the game works inside">⋯</button>
      <button className="wood" onClick={onSound} title="Sound on or off (M)">{muted ? "🔇" : "🔊"}</button>
      {more && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-[#5a3a22] bg-[#1c1714]/95 p-2 text-[#efe6d4] shadow-2xl backdrop-blur">
          <div className="px-2 pb-1 pt-0.5 text-[11px] uppercase tracking-[0.2em] text-[#cbb89a]">Behind the scenes</div>
          {[
            { label: inspectorBusy ? "🕵 Inspector at work…" : "🕵 Send for the Inspector", hint: "An AI detective solves the case for you", on: onInspector, active: inspectorBusy },
            { label: "👁 Mind's eye", hint: "Read every villager's memory", on: onMinds, active: minds },
            { label: "⌗ Graph lens", hint: "Every database query, live", on: onLens, active: lens },
          ].map((o) => (
            <button key={o.label} onClick={pick(o.on)} className={`block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${o.active ? "bg-white/10" : ""}`}>
              <div className="text-[14px]">{o.label}</div>
              <div className="text-[11.5px] text-[#cbb89a]">{o.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
