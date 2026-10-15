// Accusation and reveal: name the suspect, the motive and the statements that prove it.
// The engine scores it against the hidden truth graph, then shows what really happened next to
// what the village believed, and replays how the scene sighting changed hop by hop.
import { useEffect, useState } from "react";
import type { GameCtx } from "../App";
import { api, type Reveal, type Verdict } from "../api";
import { Portrait } from "../components/bits";

export default function RevealPage({ ctx }: { ctx: GameCtx }) {
  const suspects = ctx.village.people.filter((p) => p.id !== "silas");
  const [suspect, setSuspect] = useState("");
  const [motive, setMotive] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [statements, setStatements] = useState<{ statement_id: string; villager: string; said: string }[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Everything on the board, including the detective's questions.
    fetch(`${(import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000"}/games/${ctx.g}/case`)
      .then((r) => r.json())
      .then((b: { nodes: { kind: string; id: string; villager?: string; text?: string }[] }) =>
        setStatements(
          b.nodes
            .filter((n) => n.kind === "Statement")
            .map((n) => ({ statement_id: n.id, villager: n.villager ?? "", said: n.text ?? "" })),
        ),
      )
      .catch(() => undefined);
    api.reveal(ctx.g).then(setReveal).catch(() => undefined);
  }, [ctx.g, ctx.version]);

  const accuse = async () => {
    setError(null);
    try {
      setVerdict(await api.accuse(ctx.g, suspect, motive, picked));
      setReveal(await api.reveal(ctx.g));
    } catch (e) {
      setError(String(e));
    }
  };
  const names = Object.fromEntries(ctx.village.people.map((p) => [p.id, p.name]));

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-2xl">Accuse</h2>
        <div>
          <div className="label mb-1">Who killed Silas Crane?</div>
          <div className="grid grid-cols-5 gap-2">
            {suspects.map((p) => (
              <button key={p.id} onClick={() => setSuspect(p.id)} title={p.name}
                className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] ${suspect === p.id ? "bg-blood/30" : "hover:bg-edge/50"}`}>
                <Portrait id={p.id} name={p.name} size={34} ring={suspect === p.id ? "#c2412d" : undefined} />
                {p.name.replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1">Motive</div>
          <input className="input" value={motive} onChange={(e) => setMotive(e.target.value)} placeholder="Why did they do it?" />
        </div>
        <div>
          <div className="label mb-1">Evidence: statements on the board ({picked.length} chosen)</div>
          <div className="max-h-72 space-y-1 overflow-auto text-xs">
            {statements.length === 0 && <p className="text-muted">No statements yet.</p>}
            {statements.map((s) => (
              <label key={s.statement_id} className="flex gap-2 rounded-md p-1 hover:bg-edge/40">
                <input type="checkbox" checked={picked.includes(s.statement_id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.statement_id] : p.filter((x) => x !== s.statement_id)))} />
                <span>
                  <b>{names[s.villager] ?? s.villager}:</b> {s.said}
                </span>
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full justify-center py-2" disabled={!suspect || !picked.length} onClick={accuse}>
          Make the accusation
        </button>
        {error && <p className="text-xs text-blood">{error}</p>}
        {verdict && (
          <div className={`rounded-lg border p-3 ${verdict.correct ? "border-moss/60 bg-moss/10" : "border-blood/60 bg-blood/10"}`}>
            <div className="font-display text-xl">{verdict.summary}</div>
            <div className="mt-1 text-sm">Score {verdict.score} / 100</div>
            <div className="mt-1 text-xs text-muted">
              Evidence covered: {Object.entries(verdict.evidence).filter(([, v]) => v.length).map(([k]) => k).join(", ") || "none"}
            </div>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-display text-2xl">What really happened</h2>
        {!reveal ? (
          <p className="mt-2 text-sm text-muted">The truth opens after an accusation.</p>
        ) : (
          <div className="mt-3 grid gap-5 lg:grid-cols-2">
            <div>
              <div className="label">The truth</div>
              <p className="mt-1 text-sm">
                <b className="text-blood">{reveal.truth.killer}</b> killed {reveal.truth.victim} at the {reveal.truth.place} at{" "}
                {reveal.truth.time} with {reveal.truth.weapon}.
              </p>
              <ol className="mt-3 space-y-1.5 border-l border-edge pl-3 text-sm">
                {reveal.truth.timeline.map((e) => (
                  <li key={e.time + e.text}>
                    <span className="font-mono text-lantern">{e.time}</span> {e.text}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <div className="label">What the village believed</div>
              <p className="mt-1 text-xs text-muted">
                {reveal.gossip.hops} retellings across the village; {reveal.gossip.mutated} changed a detail on the way.
                The scene sighting, hop by hop:
              </p>
              <ol className="mt-2 space-y-1.5 text-sm">
                {reveal.sighting_rumor.map((h, i) => (
                  <li key={i} className="rounded-md bg-night px-2 py-1">
                    {h.from} → {h.to}
                    {h.changed && (
                      <span className="ml-1 text-blood">
                        ({h.changed}: {h.before} → {h.after})
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="label mt-4">Lies caught</div>
              <ul className="mt-1 space-y-1 text-sm">
                {reveal.lies_caught.map((l, i) => (
                  <li key={i}>
                    {l.detail} {l.liar && <span className="text-blood">· {l.liar}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
