// The reckoning: the villagers line up, you name the killer, the motive and the statements that
// prove it. The engine scores it against the hidden truth graph.

import { motion } from "framer-motion";
import { useState } from "react";
import { api, type Answer, type Verdict } from "../api";
import { sound } from "./audio";
import { SPRITES, Sprite } from "./characters";

const MOTIVES = ["A debt to Silas they couldn't pay", "Silas threatened to take their livelihood", "A quarrel that turned violent", "To keep a secret"];

export default function Accusation({ g, answers, names, onVerdict, onClose }: {
  g: string;
  answers: Answer[];
  names: Record<string, string>;
  onVerdict: (v: Verdict) => void;
  onClose: () => void;
}) {
  const suspects = Object.keys(names).filter((id) => SPRITES[id] && id !== "silas");
  const [suspect, setSuspect] = useState<string | null>(null);
  const [motive, setMotive] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const accuse = async () => {
    if (!suspect) return;
    setBusy(true);
    setError(null);
    try {
      sound.gavel();
      const v = await api.accuse(g, suspect, motive, evidence);
      setVerdict(v);
      if (v.correct) sound.chime(); else sound.sting();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="parchment relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-center border-b border-[#c9ae7c] px-5 py-3">
          <h2 className="font-display text-3xl">The reckoning</h2>
          <button className="wood ml-auto" onClick={onClose}>Not yet</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <p className="mb-2 font-display text-lg">Who killed Silas Crane?</p>
          <svg viewBox="0 0 1000 170" className="w-full">
            <rect x="0" y="140" width="1000" height="30" fill="#7a5230" opacity="0.4" />
            {suspects.map((id, i) => {
              const x = 55 + i * 100;
              const on = suspect === id;
              return (
                <g key={id} transform={`translate(${x} 150)`} className="cursor-pointer" onClick={() => setSuspect(id)}>
                  {on && <ellipse cx="0" cy="-60" rx="40" ry="80" fill="#ffd27a" opacity="0.35" />}
                  <g transform={`scale(${on ? 1.12 : 1})`}><Sprite who={id} talking={on} mood={on ? "worried" : "neutral"} /></g>
                  <text y="16" textAnchor="middle" fontSize="13" fill={on ? "#9a2f1f" : "#3a2a1e"} fontWeight={on ? 700 : 400}>
                    {names[id]?.replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0]}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-2 font-display text-lg">Why did they do it?</p>
              <div className="space-y-1.5">
                {MOTIVES.map((m) => (
                  <button key={m} className={`choice ${motive === m ? "!border-[#7a5230] !bg-white font-semibold" : ""}`} onClick={() => setMotive(m)}>{m}</button>
                ))}
                <input className="w-full rounded-lg border border-[#b89a6a] bg-[#fffaf0] px-3 py-2 text-[14px] text-[#2a1d14] focus:outline-none"
                  placeholder="Or in your own words…" value={MOTIVES.includes(motive) ? "" : motive} onChange={(e) => setMotive(e.target.value)} />
              </div>
            </div>
            <div>
              <p className="mb-2 font-display text-lg">Your evidence ({evidence.length})</p>
              <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
                {answers.length === 0 && <p className="text-sm italic text-[#6b5040]">You have no statements yet. Question the villagers first.</p>}
                {answers.map((a) => (
                  <label key={a.statement_id} className={`card-evidence flex cursor-pointer gap-2 ${evidence.includes(a.statement_id) ? "ring-2 ring-[#9a2f1f]" : ""}`}>
                    <input type="checkbox" checked={evidence.includes(a.statement_id)}
                      onChange={(e) => setEvidence((x) => (e.target.checked ? [...x, a.statement_id] : x.filter((s) => s !== a.statement_id)))} />
                    <span><b>{a.name}:</b> {a.dialogue.slice(0, 140)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-[#9a2f1f]">{error}</p>}
        </div>
        <div className="flex items-center gap-3 border-t border-[#c9ae7c] px-5 py-3">
          <span className="text-[13px] text-[#6b5040]">
            {suspect ? `You accuse ${names[suspect]}.` : "Choose a suspect from the lineup."}
          </span>
          <button className="wood ml-auto px-6 text-lg" disabled={!suspect || busy || !!verdict} onClick={accuse}>
            {busy ? "The village holds its breath…" : "J'accuse!"}
          </button>
        </div>

        {verdict && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1c1714]/90 p-6 text-center">
            <div className={`stamp rounded-lg border-[6px] px-8 py-3 font-display text-5xl ${verdict.correct ? "border-[#7fae5a] text-[#9fd47a]" : "border-[#c2412d] text-[#ff7a5a]"}`}>
              {verdict.correct ? "CASE CLOSED" : "WRONG MAN"}
            </div>
            <p className="max-w-xl font-display text-2xl text-[#f8eed6]">{verdict.summary}</p>
            <p className="text-[#cbb89a]">Score {verdict.score} / 100 · evidence: {Object.entries(verdict.evidence).filter(([, v]) => v.length).map(([k]) => k).join(", ") || "none"}</p>
            <button className="wood px-6 text-lg" onClick={() => onVerdict(verdict)}>See what really happened</button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
