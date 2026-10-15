// Title screen (the village at night, in fog) and the morning briefing letter.

import { motion } from "framer-motion";
import { useState } from "react";
import Scene from "./Scene";
import { skyAt } from "./world";

export function Title({ canContinue, busy, error, onNew, onContinue }: {
  canContinue: boolean;
  busy: boolean;
  error: string | null;
  onNew: () => void;
  onContinue: () => void;
}) {
  const [lamp, setLamp] = useState({ x: 50, y: 60 });
  return (
    <div className="absolute inset-0 overflow-hidden bg-black"
      onPointerMove={(e) => setLamp({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 })}>
      <div className="drift absolute inset-0 opacity-90">
        <Scene sky={skyAt(0, true)} villagers={[]} bubbles={[]} interactive={false} />
      </div>
      <div className="pointer-events-none absolute inset-0 transition-[background] duration-300"
        style={{ background: `radial-gradient(260px 220px at ${lamp.x}% ${lamp.y}%, rgba(255,200,110,0.22), transparent 70%), radial-gradient(1400px 900px at ${lamp.x}% ${lamp.y}%, transparent 30%, rgba(0,0,0,0.55) 80%)` }} />
      <div className="fog pointer-events-none absolute inset-y-0 -left-1/4 w-[150%]"
        style={{ background: "radial-gradient(60% 30% at 30% 70%, rgba(200,210,230,0.18), transparent 70%), radial-gradient(50% 25% at 75% 60%, rgba(200,210,230,0.14), transparent 70%)" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-4 text-center">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2 }}>
          <h1 className="shimmer font-display text-7xl tracking-[0.12em] drop-shadow-[0_0_30px_rgba(255,180,80,0.45)] sm:text-8xl">HEARSAY</h1>
          <p className="mt-3 font-display text-xl italic text-[#e8dcc0] sm:text-2xl">A village that remembers. A graph that never lies.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex flex-col gap-3">
          <button className="wood px-8 py-2.5 text-xl" disabled={busy} onClick={onNew}>
            {busy ? "Lighting the lanterns…" : "Begin a new investigation"}
          </button>
          {canContinue && <button className="wood px-8 py-2 text-lg" disabled={busy} onClick={onContinue}>Return to your case</button>}
        </motion.div>
        {error && <p className="max-w-md text-sm text-[#ff9a7a]">{error}</p>}
        <p className="absolute bottom-4 text-[12px] text-[#cbb89a]/70">Ten villagers · one body · every memory a FalkorDB graph</p>
      </div>
    </div>
  );
}

const LETTER = [
  "Detective,",
  "Silas Crane, our moneylender, was found dead at the Old Mill at six this morning. Dr. Cole puts the time of death between nine and ten last night. The blacksmith's hammer is missing.",
  "You have until four this afternoon. Every question you ask costs half an hour, and mind this: Hollowmere talks. Every rumor changes a little each time it's told. Ask anyone “who told you?” and follow it back.",
  "Bess at the Tavern hears everything. I'd start there.",
  "— Constable Hale",
];

export function Briefing({ onStart }: { onStart: () => void }) {
  const [shown, setShown] = useState(1);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div initial={{ rotate: -2, y: 30, opacity: 0 }} animate={{ rotate: -1, y: 0, opacity: 1 }}
        className="parchment w-full max-w-xl p-7">
        <div className="mb-3 flex items-center justify-between text-[12px] uppercase tracking-[0.25em] text-[#6b5040]">
          <span>Hollowmere constabulary</span><span>Morning, 08:00</span>
        </div>
        {LETTER.slice(0, shown).map((p, i) => (
          <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
            className={`mb-3 font-display text-[19px] leading-relaxed ${i === LETTER.length - 1 ? "text-right italic" : ""}`}>{p}</motion.p>
        ))}
        <div className="mt-4 flex justify-end">
          {shown < LETTER.length
            ? <button className="wood" onClick={() => setShown(shown + 1)}>Read on</button>
            : <button className="wood px-6 text-lg" onClick={onStart}>Take the case</button>}
        </div>
      </motion.div>
    </div>
  );
}
