// The reckoning: the villagers line up, you name the killer and why. Everything in your notebook goes
// with you as evidence; the engine scores it against the hidden truth graph. Each suspect shows how
// strongly your evidence points at them (the notebook's Q14 ranking).

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api, type Answer, type Ranking, type Verdict } from "../api";
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
  const [ranking, setRanking] = useState<Record<string, Ranking>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  useEffect(() => {
    api.suspects(g).then((s) => setRanking(Object.fromEntries(s.ranking.map((r) => [r.suspect_id, r])))).catch(() => undefined);
  }, [g]);
  const top = Math.max(1, ...Object.values(ranking).map((r) => r.score));
  const first = (id: string) => names[id]?.replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0];
  const picked = suspect ? ranking[suspect] : undefined;

  const accuse = async () => {
    if (!suspect) return;
    setBusy(true);
    setError(null);
    try {
      sound.gavel();
      const v = await api.accuse(g, suspect, motive, answers.map((a) => a.statement_id));
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
          <p className="font-display text-lg">1. Who killed Silas Crane?</p>
          <p className="mb-1 text-[12.5px] text-[#6b5040]">The bar under each name is how strongly your evidence points at them.</p>
          <svg viewBox="0 0 1000 200" className="w-full">
            <rect x="0" y="140" width="1000" height="30" fill="#7a5230" opacity="0.4" />
            {suspects.map((id, i) => {
              const x = 55 + i * 100;
              const on = suspect === id;
              const score = ranking[id]?.score ?? 0;
              return (
                <g key={id} transform={`translate(${x} 150)`} className="cursor-pointer" onClick={() => { sound.click(); setSuspect(id); }}>
                  {on && <ellipse cx="0" cy="-60" rx="40" ry="80" fill="#ffd27a" opacity="0.35" />}
                  <g transform={`scale(${on ? 2.15 : 1.9})`}><Sprite who={id} talking={on} mood={on ? "worried" : "neutral"} /></g>
                  <text y="16" textAnchor="middle" fontSize="13" fill={on ? "#9a2f1f" : "#3a2a1e"} fontWeight={on ? 700 : 400}>{first(id)}</text>
                  <rect x="-30" y="26" width="60" height="7" rx="3.5" fill="#d9c393" />
                  <rect x="-30" y="26" width={(60 * score) / top} height="7" rx="3.5" fill={score >= top * 0.75 ? "#9a2f1f" : "#c27a1d"} />
                </g>
              );
            })}
          </svg>

          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-2 font-display text-lg">2. Why did they do it?</p>
              <div className="space-y-1.5">
                {MOTIVES.map((m) => (
                  <button key={m} className={`choice ${motive === m ? "!border-[#7a5230] !bg-white font-semibold" : ""}`} onClick={() => setMotive(m)}>{m}</button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-[#fffaf0]/70 p-3 text-[13.5px] text-[#2a1d14]">
              <p className="mb-1 font-display text-lg">Your evidence</p>
              {answers.length === 0 ? (
                <p className="italic text-[#6b5040]">You have nothing yet. Question the villagers first.</p>
              ) : (
                <p>Everything in your notebook goes with you: {answers.length} statement{answers.length === 1 ? "" : "s"}.</p>
              )}
              {picked && (
                <ul className="mt-2 space-y-0.5">
                  <li>{picked.motive ? "✓" : "–"} A reason to want Silas dead</li>
                  <li>{picked.means ? "✓" : "–"} Near the missing hammer</li>
                  <li>{picked.lies ? "✓" : "–"} Caught in a lie</li>
                  <li>{picked.fits ? "✓" : "–"} Fits the sighting at the Mill</li>
                  <li>{picked.alibi ? "✗ Has an alibi someone confirmed" : "– No confirmed alibi"}</li>
                </ul>
              )}
            </div>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-[#9a2f1f]">{error}</p>}
        </div>
        <div className="flex items-center gap-3 border-t border-[#c9ae7c] px-5 py-3">
          <span className="text-[13px] text-[#6b5040]">
            {!suspect ? "Choose a suspect from the lineup." : !motive ? `You accuse ${names[suspect]}. Now choose why.` : `You accuse ${names[suspect]}.`}
          </span>
          <button className="wood ml-auto px-6 text-lg" disabled={!suspect || !motive || busy || !!verdict} onClick={accuse}>
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
