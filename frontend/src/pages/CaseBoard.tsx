// Case board: the case graph (statements, claims, people, contradictions as red), suspect ranking,
// contradictions and leads, the rumor trace with what changed at each hop, and a timeline strip.
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GameCtx } from "../App";
import { api, hhmm, type Board, type Contradiction, type Suspects, type Trace } from "../api";
import { Portrait, colorOf } from "../components/bits";

const KIND_COLOR: Record<string, string> = {
  Statement: "#efe6d4",
  Claim: "#e8a33d",
  Person: "#5b8fa8",
  Description: "#7fa25a",
  Contradiction: "#c2412d",
  Accusation: "#ffffff",
  Handoff: "#a89c88",
};

export default function CaseBoardPage({ ctx }: { ctx: GameCtx }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [found, setFound] = useState<{ contradictions: Contradiction[]; leads: Record<string, unknown>[] } | null>(null);
  const [suspects, setSuspects] = useState<Suspects | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [traceId, setTraceId] = useState<string | undefined>(ctx.focus.claimId);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);

  useEffect(() => {
    api.board(ctx.g).then(setBoard);
    api.contradictions(ctx.g).then(setFound);
    api.suspects(ctx.g).then(setSuspects);
  }, [ctx.g, ctx.version]);
  useEffect(() => {
    if (traceId) api.trace(ctx.g, traceId).then(setTrace).catch(() => setTrace(null));
  }, [ctx.g, traceId, ctx.version]);
  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(box.current?.clientWidth ?? 700));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    if (!board) return { nodes: [], links: [] };
    const ids = new Set(board.nodes.map((n) => n.id));
    const used = new Set<string>();
    const links = board.links
      .filter((l) => ids.has(l.source) && ids.has(l.target) && l.type !== "FITS")
      .map((l) => {
        used.add(l.source);
        used.add(l.target);
        return { ...l };
      });
    const nodes = board.nodes.filter((n) => used.has(n.id) || n.kind === "Statement").map((n) => ({ ...n }));
    return { nodes, links };
  }, [board]);

  const heard = ctx.answers.flatMap((a) => a.claims.filter((c) => c.reported_as === "heard").map((c) => ({ ...c, by: a.name })));
  const names = Object.fromEntries(ctx.village.people.map((p) => [p.id, p.name]));

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-3 py-2">
            <h2 className="font-display text-xl">The case board</h2>
            <div className="flex gap-3 text-[11px] text-muted">
              {Object.entries(KIND_COLOR).slice(0, 5).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {k}
                </span>
              ))}
            </div>
          </div>
          <div ref={box} className="h-[460px] bg-ink/60">
            {graph.nodes.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nothing on the board yet. Every answer adds statements and claims here.</p>
            ) : (
              <ForceGraph2D
                width={width}
                height={460}
                graphData={graph}
                backgroundColor="rgba(0,0,0,0)"
                nodeRelSize={4}
                linkDirectionalArrowLength={3}
                linkColor={(l: { type?: string }) =>
                  l.type === "INVOLVES" || l.type === "IMPLICATES" ? "#c2412d" : l.type === "DERIVED_FROM" ? "#5b8fa8" : "#3a332c"}
                linkWidth={(l: { type?: string }) => (l.type === "INVOLVES" || l.type === "IMPLICATES" ? 2.2 : l.type === "DERIVED_FROM" ? 1.8 : 0.8)}
                nodeCanvasObject={(n: Record<string, unknown> & { x?: number; y?: number }, c2d: CanvasRenderingContext2D, scale: number) => {
                  const kind = String(n.kind);
                  const r = kind === "Person" ? 6 : kind === "Contradiction" ? 6 : 4;
                  c2d.beginPath();
                  c2d.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
                  c2d.fillStyle = kind === "Person" ? colorOf(String(n.id)) : KIND_COLOR[kind] ?? "#888";
                  c2d.fill();
                  if (scale > 1.4 || kind === "Person" || kind === "Contradiction") {
                    const label = kind === "Person" ? String(n.name ?? n.id) : kind === "Contradiction" ? "✗" : kind === "Description" ? String(n.text) : "";
                    if (label) {
                      c2d.font = `${10 / Math.max(scale, 1)}px Inter`;
                      c2d.fillStyle = kind === "Contradiction" ? "#c2412d" : "#efe6d4";
                      c2d.fillText(label, (n.x ?? 0) + r + 2, (n.y ?? 0) + 3);
                    }
                  }
                }}
                nodeLabel={(n: Record<string, unknown>) =>
                  String(n.kind === "Statement" ? n.text : n.kind === "Claim" ? `${n.pred} ${n.subject_id} @ ${n.place_id ?? ""} (${n.reported_as})` : n.detail ?? n.name ?? n.text ?? n.id)}
                onNodeClick={(n: Record<string, unknown>) => n.kind === "Claim" && n.reported_as === "heard" && setTraceId(String(n.id))}
              />
            )}
          </div>
        </section>

        <Timeline board={board} names={names} />
      </div>

      <div className="space-y-4">
        <section className="card p-4">
          <div className="label">Suspects (Q14)</div>
          {suspects?.sighting_text && (
            <p className="mt-1 text-xs text-muted">
              Scene sighting you hold: <span className="text-lantern">“{suspects.sighting_text}”</span>
            </p>
          )}
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-[11px] text-muted">
              <tr>
                <th className="py-1">Suspect</th>
                <th>Motive</th>
                <th>Means</th>
                <th>Lies</th>
                <th>Fits</th>
                <th>Alibi</th>
                <th className="text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {suspects?.ranking.slice(0, 6).map((r, i) => (
                <tr key={r.suspect_id} className={i === 0 ? "text-lantern" : ""}>
                  <td className="py-1">{r.suspect}</td>
                  <td>{r.motive}</td>
                  <td>{r.means}</td>
                  <td>{r.lies}</td>
                  <td>{r.fits ? "✓" : ""}</td>
                  <td>{r.alibi ? "✓" : ""}</td>
                  <td className="text-right font-semibold">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-4">
          <div className="label">Rumor trace (Q7)</div>
          <select className="input mt-2" value={traceId ?? ""} onChange={(e) => setTraceId(e.target.value || undefined)}>
            <option value="">Pick a heard claim…</option>
            {heard.map((c) => (
              <option key={c.claim_id} value={c.claim_id}>
                {c.by}: {c.label.slice(0, 80)}
              </option>
            ))}
          </select>
          {trace && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-stretch gap-2">
                {trace.chain.map((h, i) => (
                  <div key={h.claim_id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted">←</span>}
                    <div className="w-[118px] rounded-lg border border-edge bg-night p-2 text-center text-[11px]">
                      <div className="flex justify-center">
                        <Portrait id={h.teller} name={h.teller_name} size={30} />
                      </div>
                      <div className="mt-1 font-semibold">{h.teller_name}</div>
                      <div className={h.changed.includes("about") ? "font-semibold text-blood" : ""}>{h.about}</div>
                      <div className={h.changed.includes("place") ? "font-semibold text-blood" : ""}>{h.place}</div>
                      <div className={h.changed.includes("time") ? "font-semibold text-blood" : ""}>{h.time}</div>
                      <div className="text-muted">{h.reported_as}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">
                {trace.reached_eyewitness
                  ? "Reached the eyewitness. Red marks what changed between hops."
                  : trace.ask_next
                    ? `Chain still open: ask ${names[trace.ask_next] ?? trace.ask_next} where they heard it.`
                    : "Ask “Who told you?” to follow it further."}
              </p>
            </div>
          )}
        </section>

        <section className="card p-4">
          <div className="label">Contradictions</div>
          <ul className="mt-2 space-y-2 text-sm">
            {found?.contradictions.length === 0 && <li className="text-muted">None yet.</li>}
            {found?.contradictions.map((c) => (
              <li key={c.key} className="rounded-lg border border-blood/40 bg-blood/10 px-3 py-2">
                <div>{c.detail}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {c.kind.replace(/_/g, " ")} · {c.implicates_name ? `implicates ${c.implicates_name}` : "open lead: nobody implicated yet"}
                </div>
              </li>
            ))}
          </ul>
          <div className="label mt-4">Leads nobody else backs up (Q8b)</div>
          <ul className="mt-1 space-y-1 text-xs text-parchment/80">
            {found?.leads.map((l, i) => (
              <li key={i}>
                {String(l.only_source)}: {String(l.what)} {String(names[String(l.about)] ?? l.about)} at {String(l.place ?? "?")}{" "}
                {typeof l.t_from === "number" ? hhmm(l.t_from + 5) : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Timeline({ board, names }: { board: Board | null; names: Record<string, string> }) {
  // Where each person is claimed to have been (first-hand, 18:00 to 24:00). Gaps are missing alibis.
  const start = 1080;
  const end = 1440;
  const claims = (board?.nodes ?? []).filter(
    (n) => n.kind === "Claim" && n.pred === "WAS_AT" && n.reported_as === "saw" && names[String(n.subject_id)],
  );
  const people = [...new Set(claims.map((c) => String(c.subject_id)))];
  return (
    <section className="card p-4">
      <div className="label">Timeline 18:00–24:00 (first-hand claims)</div>
      <div className="mt-3 space-y-1.5">
        {people.length === 0 && <p className="text-xs text-muted">No first-hand whereabouts yet.</p>}
        {people.map((p) => (
          <div key={p} className="flex items-center gap-2 text-xs">
            <span className="w-28 truncate">{names[p]}</span>
            <div className="relative h-4 flex-1 rounded bg-night">
              <div className="absolute inset-y-0 w-px bg-blood/70" style={{ left: `${((1290 - start) / (end - start)) * 100}%` }} title="time of death" />
              {claims
                .filter((c) => String(c.subject_id) === p)
                .map((c) => {
                  const a = Math.max(Number(c.t_from), start);
                  const b = Math.min(Number(c.t_to), end);
                  if (b <= a) return null;
                  return (
                    <div
                      key={String(c.id)}
                      title={`${c.place_id} ${hhmm(Number(c.t_from))}–${hhmm(Number(c.t_to))} (says ${names[String(c.teller_id)] ?? c.teller_id})`}
                      className="absolute inset-y-0.5 rounded-sm opacity-80"
                      style={{
                        left: `${((a - start) / (end - start)) * 100}%`,
                        width: `${((b - a) / (end - start)) * 100}%`,
                        background: colorOf(String(c.teller_id)),
                      }}
                    />
                  );
                })}
            </div>
          </div>
        ))}
        <div className="flex justify-between pl-[7.5rem] text-[10px] text-muted">
          {["18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "24:00"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
