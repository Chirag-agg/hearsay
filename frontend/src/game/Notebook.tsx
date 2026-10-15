// The detective's corkboard: evidence pinned by who said it, contradictions on red string,
// suspects as wanted posters (Q14), rumor traces as a chain of portraits (Q7), and the raw graph.

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { api, hhmm, type Answer, type Board, type Contradiction, type Suspects, type Trace } from "../api";
import { Portrait } from "./characters";

const TABS = ["Evidence", "Suspects", "Rumors", "Graph"] as const;
type Tab = (typeof TABS)[number];

function Pin({ color = "#c2412d" }: { color?: string }) {
  return <span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full shadow" style={{ background: `radial-gradient(circle at 35% 35%, #fff8 0, ${color} 45%)` }} />;
}

export default function Notebook({ g, answers, names, version, focusClaim, onClose }: {
  g: string;
  answers: Answer[];
  names: Record<string, string>;
  version: number;
  focusClaim?: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(focusClaim ? "Rumors" : "Evidence");
  const [found, setFound] = useState<{ contradictions: Contradiction[]; leads: Record<string, unknown>[] } | null>(null);
  const [suspects, setSuspects] = useState<Suspects | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [traceId, setTraceId] = useState<string | null>(focusClaim ?? null);
  const [trace, setTrace] = useState<Trace | null>(null);

  useEffect(() => {
    api.contradictions(g).then(setFound).catch(() => undefined);
    api.suspects(g).then(setSuspects).catch(() => undefined);
    api.board(g).then(setBoard).catch(() => undefined);
  }, [g, version]);
  useEffect(() => {
    if (traceId) api.trace(g, traceId).then(setTrace).catch(() => setTrace(null));
  }, [g, traceId, version]);

  const byVillager = useMemo(() => {
    const out: Record<string, Answer[]> = {};
    answers.forEach((a) => (out[a.villager] ??= []).push(a));
    return out;
  }, [answers]);
  const heard = answers.flatMap((a) => a.claims.filter((c) => c.reported_as === "heard").map((c) => ({ ...c, by: a.villager })));

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
      className="absolute inset-0 z-40 flex flex-col bg-black/60 p-2 backdrop-blur-[2px] sm:p-5">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-[10px] border-[#5e3d22] shadow-2xl"
        style={{ background: "radial-gradient(circle at 20% 30%, #c4955f 0, #b0814e 40%, #9c6f40 100%)" }}>
        <div className="flex flex-wrap items-center gap-2 border-b-4 border-[#5e3d22] bg-[#4a2f1a]/70 px-3 py-2">
          <span className="font-display text-2xl text-[#f8eed6]">Case notes</span>
          <div className="ml-2 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t} className={`wood ${tab === t ? "wood-on" : ""}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <button className="wood ml-auto" onClick={onClose}>Close notebook</button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {tab === "Evidence" && (
            <div className="space-y-6">
              {answers.length === 0 && <Note>Nothing pinned yet. Question the villagers: everything they tell you ends up here.</Note>}
              {(found?.contradictions.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 font-display text-xl text-[#2a1d14]">Red string: stories that cannot both be true</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {found!.contradictions.map((c, i) => (
                      <div key={c.key} className="relative rounded-sm bg-[#fffaf0] p-3 pt-4 shadow-lg" style={{ rotate: `${i % 2 ? 0.8 : -0.8}deg` }}>
                        <Pin />
                        <div className="absolute inset-x-6 top-1/2 h-[3px] -rotate-6 bg-[#c2412d]/70" />
                        <p className="relative text-[14px] text-[#2a1d14]">{c.detail}</p>
                        <div className="relative mt-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-[#6b5040]">
                          <span>{c.kind.replace(/_/g, " ")}</span>
                          {c.implicates_name
                            ? <span className="stamp rounded border-2 border-[#9a2f1f] px-2 py-0.5 font-bold text-[#9a2f1f]">implicates {c.implicates_name}</span>
                            : <span className="italic">open lead</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(byVillager).map(([v, list], i) => (
                  <div key={v} className="relative rounded-sm bg-[#fbf3df] p-3 pt-5 shadow-lg" style={{ rotate: `${(i % 3) - 1}deg` }}>
                    <Pin color="#2d5f78" />
                    <div className="mb-2 flex items-center gap-2">
                      <Portrait who={v} size={46} />
                      <span className="font-display text-lg text-[#2a1d14]">{names[v]}</span>
                    </div>
                    <ul className="space-y-1.5 text-[13px] text-[#2a1d14]">
                      {list.flatMap((a) => a.claims).map((c) => (
                        <li key={c.claim_id} className="flex gap-1.5">
                          <span className={c.reported_as === "heard" ? "text-[#2d5f78]" : "text-[#9a2f1f]"}>{c.reported_as === "heard" ? "◌" : "●"}</span>
                          <span>
                            {c.label}
                            {c.can_ask_source && (
                              <button className="ml-1 text-[11px] font-semibold text-[#2d5f78] underline decoration-dotted"
                                onClick={() => { setTraceId(c.claim_id); setTab("Rumors"); }}>trace</button>
                            )}
                          </span>
                        </li>
                      ))}
                      {list.every((a) => a.claims.length === 0) && <li className="italic text-[#6b5040]">Said nothing useful.</li>}
                    </ul>
                  </div>
                ))}
              </section>
              {(found?.leads.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 font-display text-xl text-[#2a1d14]">Leads only one witness backs</h3>
                  <div className="flex flex-wrap gap-2">
                    {found!.leads.map((l, i) => (
                      <span key={i} className="rounded-sm bg-[#fff6c8] px-2.5 py-1.5 text-[12px] text-[#2a1d14] shadow">
                        {String(l.only_source)}: {String(l.what).toLowerCase().replace("_", " ")} {names[String(l.about)] ?? String(l.about)}
                        {l.place ? ` at ${String(l.place)}` : ""} {typeof l.t_from === "number" ? hhmm(l.t_from + 5) : ""}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === "Suspects" && (
            <div>
              <Note>
                {suspects?.sighting_text
                  ? <>The scene sighting you hold: <b>“{suspects.sighting_text}”</b>. Trace it back to its eyewitness before you trust it.</>
                  : "Nobody has told you about a sighting at the scene yet."}
              </Note>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {suspects?.ranking.filter((r) => r.score > 0 || r.motive || r.lies).slice(0, 10).map((r, i) => (
                  <motion.div key={r.suspect_id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}
                    className="relative flex flex-col items-center rounded-sm bg-[#efe1bd] p-3 pt-5 text-[#2a1d14] shadow-xl" style={{ rotate: `${(i % 3) - 1}deg` }}>
                    <Pin color={i === 0 ? "#c2412d" : "#7a5230"} />
                    <div className="font-display text-lg tracking-[0.25em]">WANTED</div>
                    <div className="my-1 rounded-full bg-[#d9c393]"><Portrait who={r.suspect_id} size={92} /></div>
                    <div className="font-display text-xl">{r.suspect}</div>
                    <div className="mt-1 font-display text-4xl text-[#9a2f1f]">{r.score}</div>
                    <div className="mt-2 grid w-full grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">
                      <span>Motive</span><b className="text-right">{r.motive ? "●".repeat(r.motive) : "–"}</b>
                      <span>Means</span><b className="text-right">{r.means ? "●" : "–"}</b>
                      <span>Lies caught</span><b className="text-right">{r.lies || "–"}</b>
                      <span>Fits sighting</span><b className="text-right">{r.fits ? "yes" : "–"}</b>
                      <span>Alibi</span><b className="text-right">{r.alibi ? "confirmed" : "none"}</b>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {tab === "Rumors" && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {heard.length === 0 && <Note>No hearsay yet. When a villager says “so-and-so told me”, it can be traced here.</Note>}
                {heard.map((c) => (
                  <button key={c.claim_id} onClick={() => setTraceId(c.claim_id)}
                    className={`max-w-xs rounded-sm px-2.5 py-1.5 text-left text-[12px] shadow ${traceId === c.claim_id ? "bg-white ring-2 ring-[#2d5f78]" : "bg-[#fbf3df]"} text-[#2a1d14]`}>
                    <b>{names[c.by]}:</b> {c.label.slice(0, 80)}
                  </button>
                ))}
              </div>
              {trace && (
                <div className="rounded-sm bg-[#fbf3df]/95 p-4 shadow-xl">
                  <div className="flex flex-wrap items-end gap-1">
                    {trace.chain.map((h, i) => (
                      <div key={h.claim_id} className="flex items-end">
                        {i > 0 && <span className="mx-1 mb-16 font-display text-2xl text-[#7a5230]">←</span>}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.25 }}
                          className="flex w-40 flex-col items-center">
                          <div className="relative mb-2 w-full rounded-xl border-2 border-[#7a5230] bg-white px-2 py-1.5 text-center text-[12.5px] text-[#2a1d14]">
                            <span className={h.changed.includes("about") ? "font-bold text-[#c2412d]" : ""}>{h.about}</span>{" "}
                            at the <span className={h.changed.includes("place") ? "font-bold text-[#c2412d]" : ""}>{h.place}</span>,{" "}
                            <span className={h.changed.includes("time") ? "font-bold text-[#c2412d]" : ""}>{h.time}</span>
                            <span className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-[#7a5230] bg-white" />
                          </div>
                          <Portrait who={h.teller} size={70} />
                          <div className="text-[13px] font-semibold text-[#2a1d14]">{h.teller_name}</div>
                          <div className="text-[11px] uppercase tracking-wider text-[#6b5040]">{h.reported_as === "saw" ? "saw it" : "heard it"}</div>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[13px] text-[#2a1d14]">
                    {trace.reached_eyewitness
                      ? "This is where the rumor started: an eyewitness. Red marks what changed as it was passed along."
                      : "The chain is still open. Ask the last person “Who told you?” and go and question their source."}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "Graph" && <BoardGraph board={board} />}
        </div>
      </div>
    </motion.div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="relative inline-block max-w-2xl rounded-sm bg-[#fff6c8] px-4 py-3 pt-4 text-[14px] text-[#2a1d14] shadow-lg"><Pin color="#d9b44a" />{children}</div>;
}

const KIND_COLOR: Record<string, string> = {
  Statement: "#fbf3df", Claim: "#e8a33d", Person: "#2d5f78", Description: "#5f8f4a", Contradiction: "#c2412d", Accusation: "#ffffff",
};

function BoardGraph({ board }: { board: Board | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  useEffect(() => {
    const ro = new ResizeObserver(() => setSize({ w: box.current?.clientWidth ?? 800, h: Math.max(420, (box.current?.clientHeight ?? 520)) }));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const data = useMemo(() => {
    if (!board) return { nodes: [], links: [] };
    const ids = new Set(board.nodes.map((n) => n.id));
    const links = board.links.filter((l) => ids.has(l.source) && ids.has(l.target) && l.type !== "FITS").map((l) => ({ ...l }));
    const used = new Set(links.flatMap((l) => [l.source, l.target]));
    return { nodes: board.nodes.filter((n) => used.has(n.id)).map((n) => ({ ...n })), links };
  }, [board]);
  return (
    <div ref={box} className="h-[65vh] rounded-sm bg-[#1c1714]/85 shadow-inner">
      <p className="px-3 pt-2 text-[12px] text-[#efe6d4]/80">
        The case graph in FalkorDB: statements, claims, people, descriptions, and contradictions (red). Blue links are DERIVED_FROM: a rumor traced to its source.
      </p>
      <ForceGraph2D width={size.w} height={size.h - 30} graphData={data} backgroundColor="rgba(0,0,0,0)" nodeRelSize={4}
        linkDirectionalArrowLength={3}
        linkColor={(l: { type?: string }) => (l.type === "INVOLVES" || l.type === "IMPLICATES" ? "#c2412d" : l.type === "DERIVED_FROM" ? "#5b8fa8" : "#6b5a48")}
        linkWidth={(l: { type?: string }) => (l.type === "DERIVED_FROM" || l.type === "IMPLICATES" ? 2 : 0.8)}
        nodeColor={(n: Record<string, unknown>) => KIND_COLOR[String(n.kind)] ?? "#999"}
        nodeLabel={(n: Record<string, unknown>) => String(n.kind === "Statement" ? n.text : n.kind === "Claim" ? `${n.pred} ${n.subject_id} @ ${n.place_id ?? ""} (${n.reported_as})` : n.detail ?? n.name ?? n.text ?? n.id)} />
    </div>
  );
}
