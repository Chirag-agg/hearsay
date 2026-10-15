// Live query monitor: every Cypher call the backend makes, with graph and milliseconds,
// plus the "FalkorDB features used" table built from the same log.
import { useEffect, useState } from "react";
import { api, type QueryLog } from "../api";

export default function QueryMonitor({ onClose }: { onClose: () => void }) {
  const [log, setLog] = useState<QueryLog | null>(null);
  useEffect(() => {
    const load = () => api.queries(80).then(setLog).catch(() => undefined);
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const features = new Map<string, number>();
  log?.stats.forEach((s) => s.features.forEach((f) => features.set(f, (features.get(f) ?? 0) + s.calls)));

  return (
    <div className="absolute bottom-3 right-3 top-3 z-20 flex w-[min(560px,calc(100%-24px))] flex-col rounded-xl border border-edge bg-ink/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2">
        <span className="font-display text-lg text-lantern">Live query monitor</span>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 overflow-hidden p-3">
        <div>
          <div className="label mb-1">FalkorDB features in use</div>
          <div className="flex flex-wrap gap-1.5">
            {[...features.entries()].map(([f, n]) => (
              <span key={f} className="rounded-md bg-river/15 px-2 py-0.5 text-xs text-river">
                {f} · {n}
              </span>
            ))}
          </div>
        </div>
        <div className="min-h-0 overflow-auto font-mono text-[11px]">
          <table className="w-full">
            <thead className="sticky top-0 bg-ink text-left text-muted">
              <tr>
                <th className="py-1 pr-2">graph</th>
                <th className="pr-2">query</th>
                <th className="pr-2 text-right">ms</th>
                <th className="text-right">rows</th>
              </tr>
            </thead>
            <tbody>
              {[...(log?.recent ?? [])].reverse().map((q, i) => (
                <tr key={i} className={q.error ? "text-blood" : q.readonly ? "text-parchment/80" : "text-lantern"}>
                  <td className="truncate py-0.5 pr-2">{q.graph.replace(/^game_[0-9a-f]+_/, "")}</td>
                  <td className="truncate pr-2">{q.query}</td>
                  <td className="pr-2 text-right">{q.ms.toFixed(1)}</td>
                  <td className="text-right">{q.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
