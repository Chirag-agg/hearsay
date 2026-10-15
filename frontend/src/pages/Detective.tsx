// Detective panel: hand the case to the detective agent. Its steps stream in live (tool, why,
// one-line result); when it finishes, each step also shows the Cypher behind it.
import { useState } from "react";
import type { GameCtx } from "../App";
import { api, type DetectiveStep, type GameEvent } from "../api";
import { CypherBlock, Spinner } from "../components/bits";

export default function DetectivePage({ ctx, feed }: { ctx: GameCtx; feed: GameEvent[] }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ mode: string; steps: DetectiveStep[]; report: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startSeq, setStartSeq] = useState(0);

  const live = feed
    .filter((e) => e.type === "detective_step" && e.seq >= startSeq)
    .slice()
    .reverse();

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setStartSeq(feed[0]?.seq ? feed[0].seq + 1 : 0);
    try {
      const out = await api.detective(ctx.g);
      setResult(out);
      ctx.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="card flex flex-wrap items-center gap-4 p-4">
        <div className="flex-1">
          <h2 className="font-display text-2xl">Call the detective</h2>
          <p className="text-sm text-muted">
            The detective works over the <span className="font-mono text-river">hearsay-graph</span> MCP server: PageRank,
            rumor traces, contradiction checks, alibi independence and the suspect ranking, every one a Cypher query. It
            reads what is already on the board and never sees the truth graph.
          </p>
        </div>
        <button className="btn-primary px-5 py-2" onClick={run} disabled={running}>
          {running ? "Investigating…" : "Hand over the case"}
        </button>
      </section>

      {error && <p className="text-sm text-blood">{error}</p>}
      {running && (
        <section className="card space-y-2 p-4">
          <Spinner text="The detective is working. Steps appear as it takes them." />
          {live.map((e) => (
            <div key={e.seq} className="rounded-lg bg-night px-3 py-2 text-sm">
              <span className="font-mono text-river">{String(e.tool)}</span>
              <span className="ml-2 text-muted">{String(e.why)}</span>
              <div className="mt-0.5">{String(e.summary)}</div>
            </div>
          ))}
        </section>
      )}

      {result && (
        <section className="card space-y-3 p-4">
          <div className="rounded-lg border border-moss/50 bg-moss/10 p-3">
            <div className="label">Case report</div>
            <p className="mt-1 font-display text-lg">{result.report}</p>
            <p className="mt-1 text-xs text-muted">mode: {result.mode}</p>
          </div>
          <ol className="space-y-2">
            {result.steps.map((s) => (
              <li key={s.step} className="rounded-lg bg-night p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-muted">{s.step}.</span>
                  <span className="font-mono text-river">
                    {s.tool}({Object.entries(s.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})
                  </span>
                </div>
                {s.why && <div className="mt-1 text-xs italic text-muted">{s.why}</div>}
                <div className="mt-1">{s.summary}</div>
                <div className="mt-1 space-y-0.5">
                  {s.cypher.map((c) => (
                    <CypherBlock key={c.query} title={c.query} cypher={c.cypher} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
