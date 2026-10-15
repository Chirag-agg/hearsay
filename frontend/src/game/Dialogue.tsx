// Interrogation as a visual-novel scene: portrait, name plate, typewriter answer, evidence cards,
// "Who told you?", and questions as choices or free text. Every question costs 30 minutes.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api, type Answer, type Chip, type Source } from "../api";
import { Portrait } from "./characters";

const GREETING: Record<string, string> = {
  bess: "What'll it be, detective? Everyone talks in my tavern, and I hear all of it.",
  hale: "Constable Hale, at your service. A terrible business, this.",
  imogen: "I've examined the body. Ask what you need, but be precise.",
  tilly: "Are you a real detective? I see things. Grown-ups never listen.",
  jonas: "Make it quick. The forge won't wait, and neither will I.",
  wren: "You may speak. Briefly.",
  elena: "Can I offer you some chamomile? For the nerves. Such a shock.",
  aldric: "Peace be with you, detective. How can I help?",
  pip: "Eh? Who's asking? I've seen things, I have. Strange things.",
  brann: "My mill. Of all the places. I found him, you know.",
};

const ASK: Record<string, string[]> = {
  bess: ["Who was at the tavern last night?", "Did you see anyone near the mill?", "What happened between Jonas and Silas?"],
  hale: ["Who was at the tavern last night?", "What did you see last night?"],
  imogen: ["Who was at the tavern last night?", "When did Silas die?"],
  tilly: ["Did you see Elena or Jonas at the smithy, and did Silas threaten anyone?", "Does Elena owe Silas money?"],
  aldric: ["When did Elena leave the chapel?", "Where were you last night?"],
  elena: ["Where were you between 21:00 and 22:00?", "Did you see Jonas last night?"],
  jonas: ["Where were you between 21:00 and 22:00?", "Did you argue with Silas?"],
  wren: ["Was Jonas with you last night?", "Where were you last night?"],
  pip: ["What did you see on the river path at 21:30?", "Where were you last night?"],
  brann: ["Who found Silas this morning?", "Who could get into the mill?"],
};

export type Follow = { villager: string; aboutClaimId: string; label: string; teller: string };

function Typewriter({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    setN(0);
    done.current = false;
    const t = setInterval(() => setN((k) => Math.min(k + 2, text.length)), 24);
    return () => clearInterval(t);
  }, [text]);
  useEffect(() => {
    if (n >= text.length && !done.current) {
      done.current = true;
      onDone();
    }
  }, [n, text, onDone]);
  return (
    <span onClick={() => setN(text.length)} className={n < text.length ? "caret" : ""}>
      {text.slice(0, n)}
    </span>
  );
}

export default function Dialogue({
  g, villager, name, role, questionsLeft, statements, pending, onAnswer, onFollow, onLeave,
}: {
  g: string;
  villager: string;
  name: string;
  role: string;
  questionsLeft: number;
  statements: Answer[];
  pending?: Follow | null;
  onAnswer: (a: Answer) => void;
  onFollow: (f: Follow) => void;
  onLeave: () => void;
}) {
  const [line, setLine] = useState(GREETING[villager] ?? "Yes?");
  const [typing, setTyping] = useState(true);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [source, setSource] = useState<{ chip: Chip; s: Source } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [cites, setCites] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [about, setAbout] = useState<Follow | null>(pending ?? null);

  useEffect(() => {
    if (pending) setAbout(pending); // following a rumor here from someone else's "who told you?"
  }, [pending]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSource(null);
    setLine("…");
    try {
      const a = await api.ask(g, villager, q, { about_claim_id: about?.aboutClaimId, cite_statement_ids: cites });
      setAnswer(a);
      setLine(a.dialogue);
      setTyping(true);
      setQuestion("");
      setCites([]);
      setAbout(null);
      onAnswer(a);
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
      setLine("…");
    } finally {
      setBusy(false);
    }
  };

  const whoTold = async (chip: Chip) => {
    try {
      const s = await api.source(g, chip.claim_id);
      setSource({ chip, s });
      setLine(s.dialogue);
      setTyping(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const mood = answer?.emotion === "guarded" || (answer?.withheld ?? 0) > 0 ? "guarded" : undefined;
  const out = questionsLeft <= 0;

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-30 mx-auto max-w-6xl sm:inset-x-4 sm:bottom-4">
      <div className="parchment flex max-h-[78vh] flex-col gap-3 overflow-hidden p-3 lg:max-h-[46vh] lg:flex-row lg:p-4">
        <div className="flex shrink-0 flex-row items-center gap-3 lg:w-44 lg:flex-col">
          <div className="rounded-full ring-4 ring-[#7a5230]/60">
            <span className="hidden lg:block"><Portrait who={villager} size={150} talking={typing && line !== "…"} mood={mood} /></span>
            <span className="lg:hidden"><Portrait who={villager} size={76} talking={typing && line !== "…"} mood={mood} /></span>
          </div>
          <div className="text-left lg:text-center">
            <div className="wood inline-block cursor-default px-4 py-1 text-lg">{name}</div>
            <div className="mt-1 text-xs italic text-[#6b5040]">{role}{mood ? " · guarded" : ""}</div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto pr-1 [&>*]:shrink-0">
          <p className="font-display text-[18px] leading-snug lg:min-h-[3.5rem] lg:text-[21px]">
            {busy ? <span className="animate-pulse text-[#7a5230]">{name.split(" ")[0]} thinks…</span> : (
              <>“<Typewriter text={line} onDone={() => setTyping(false)} />”</>
            )}
          </p>

          {answer && !busy && !typing && answer.claims.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {answer.claims.map((c, i) => (
                <motion.div key={c.claim_id} initial={{ opacity: 0, y: 10, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: i % 2 ? 0.6 : -0.6 }}
                  transition={{ delay: i * 0.12 }} className="card-evidence flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    c.reported_as === "heard" ? "bg-[#5b8fa8]/20 text-[#2d5f78]" : "bg-[#c2412d]/15 text-[#9a2f1f]"}`}>
                    {c.reported_as === "heard" ? "hearsay" : "saw it"}
                  </span>
                  <span className="flex-1">
                    {c.label}
                    {c.can_ask_source && (
                      <button className="mt-1 block text-[12px] font-semibold text-[#2d5f78] underline decoration-dotted hover:text-[#9a2f1f]"
                        onClick={() => whoTold(c)}>Who told you?</button>
                    )}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          <AnimatePresence>
            {answer && !typing && answer.contradictions_new.map((c) => (
              <motion.div key={c.key} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="rounded-md border-2 border-[#9a2f1f] bg-[#c2412d]/10 px-3 py-2 text-[13px] font-semibold text-[#9a2f1f]">
                ✗ Contradiction: {c.detail}
              </motion.div>
            ))}
          </AnimatePresence>

          {source?.s.ask_next && !typing && (
            <button className="wood self-start" onClick={() => onFollow({
              villager: source.s.ask_next!.villager_id, aboutClaimId: source.s.ask_next!.about_claim_id,
              label: source.chip.label, teller: name,
            })}>
              Go and ask {source.s.source_name} about it →
            </button>
          )}

          {error && <p className="text-sm font-semibold text-[#9a2f1f]">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-2 lg:w-80">
          {about && (
            <div className="rounded-md bg-[#5b8fa8]/15 px-2 py-1.5 text-[12px] text-[#2d5f78]">
              Asking about what {about.teller} said: “{about.label.slice(0, 90)}”
              <button className="ml-1 font-bold" onClick={() => setAbout(null)}>×</button>
            </div>
          )}
          {about ? (
            <button className="choice" disabled={busy || out} onClick={() => ask("Who told you about that, and what exactly did you hear?")}>
              “Who told you about that, and what exactly did you hear?”
            </button>
          ) : (
            (ASK[villager] ?? []).map((q) => (
              <button key={q} className="choice" disabled={busy || out} onClick={() => ask(q)}>“{q}”</button>
            ))
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy || out}
              placeholder={out ? "The day is over." : "Ask your own question…"}
              className="w-full rounded-lg border border-[#b89a6a] bg-[#fffaf0] px-3 py-2 text-[14px] text-[#2a1d14] placeholder:text-[#9a8466] focus:border-[#7a5230] focus:outline-none" />
            <button className="wood" disabled={busy || out || !question.trim()}>Ask</button>
          </form>
          <div className="flex items-center gap-2">
            {statements.length > 0 && (
              <button className="text-[13px] font-semibold text-[#7a5230] underline decoration-dotted" onClick={() => setPicking(!picking)}>
                Show them evidence{cites.length ? ` (${cites.length})` : ""}
              </button>
            )}
            <span className="ml-auto text-[12px] text-[#6b5040]">30 min per question</span>
            <button className="wood" onClick={onLeave}>Leave</button>
          </div>
          {picking && (
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-[#c9ae7c] bg-[#fffaf0] p-2 text-[12px]">
              {statements.map((s) => (
                <label key={s.statement_id} className="flex gap-2">
                  <input type="checkbox" checked={cites.includes(s.statement_id)}
                    onChange={(e) => setCites((c) => (e.target.checked ? [...c, s.statement_id] : c.filter((x) => x !== s.statement_id)))} />
                  <span><b>{s.name}:</b> {s.dialogue.slice(0, 110)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
