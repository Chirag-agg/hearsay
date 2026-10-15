// God view (demo only): every villager's memory graph side by side. Heard claims carry who told
// them; mutated ones show which detail changed on the way; secrets are marked.
import { useEffect, useState } from "react";
import type { GameCtx } from "../App";
import { api, hhmm, type GodClaim } from "../api";
import { Portrait, Spinner } from "../components/bits";

export default function GodViewPage({ ctx }: { ctx: GameCtx }) {
  const [minds, setMinds] = useState<Record<string, { claims: GodClaim[]; heard: number; mutated: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.god(ctx.g).then(setMinds).catch((e) => setError(String(e)));
  }, [ctx.g, ctx.version]);
  const names = Object.fromEntries(ctx.village.people.map((p) => [p.id, p.name]));

  if (error) return <p className="text-sm text-blood">{error}</p>;
  if (!minds) return <Spinner text="Reading 10 memory graphs…" />;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Ten graphs, one per villager. Each agent can only ever read its own column. Demo view only.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Object.entries(minds).map(([id, m]) => (
          <section key={id} className="card flex max-h-[75vh] flex-col p-3">
            <div className="mb-2 flex items-center gap-2">
              <Portrait id={id} name={names[id] ?? id} size={30} />
              <div className="text-sm leading-tight">
                {names[id]}
                <div className="text-[11px] text-muted">
                  {m.claims.length} beliefs · {m.heard} heard · {m.mutated} mutated
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-1 overflow-auto text-[11px]">
              {m.claims.slice(0, 40).map((c) => (
                <li key={c.id} className={`rounded px-1.5 py-1 ${c.origin === "heard" ? "bg-river/10" : c.origin === "lie" ? "bg-blood/15" : "bg-lantern/10"}`}>
                  <span className="font-semibold">{c.pred}</span> {c.about} {c.place && `@ ${c.place}`}{" "}
                  <span className="text-muted">{hhmm(c.t_from)}</span>
                  {c.heard_from && <span className="text-river"> ← {names[c.heard_from]?.split(" ")[0]}</span>}
                  {c.mutated && <span className="text-blood"> ({c.mutated} changed)</span>}
                  {c.secret && <span className="text-lantern"> · secret</span>}
                  {c.origin === "lie" && <span className="text-blood"> · lie</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
