// Inspector Graves' case log: the detective agent's MCP tool calls as they happen, and the Cypher
// behind each once the run is done.

import { motion } from "framer-motion";
import type { DetectiveStep, GameEvent } from "../api";
import { Portrait } from "./characters";

export default function InspectorLog({ live, result, running, onClose }: {
  live: GameEvent[];
  result: { mode: string; steps: DetectiveStep[]; report: string } | null;
  running: boolean;
  onClose: () => void;
}) {
  const steps = result?.steps ?? live.map((e) => ({
    step: Number(e.step), tool: String(e.tool), args: (e.args as Record<string, unknown>) ?? {}, why: String(e.why ?? ""),
    summary: String(e.summary), cypher: [] as { query: string; cypher: string }[],
  }));
  return (
    <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
      className="pointer-events-auto absolute bottom-3 right-3 top-24 z-30 flex w-[min(440px,calc(100vw-24px))] flex-col parchment">
      <div className="flex items-center gap-3 border-b border-[#c9ae7c] p-3">
        <Portrait who="inspector" size={64} talking={running} />
        <div className="flex-1">
          <div className="font-display text-xl">Inspector Graves</div>
          <div className="text-[12px] text-[#6b5040]">
            Works only through the <span className="font-mono">hearsay-graph</span> MCP tools. Never sees the truth.
          </div>
        </div>
        <button className="wood" onClick={onClose}>Close</button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {steps.length === 0 && running && <p className="animate-pulse text-sm text-[#6b5040]">The inspector studies your notes…</p>}
        {steps.map((s) => (
          <motion.div key={s.step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-md border border-[#c9ae7c] bg-[#fffaf0] p-2.5 text-[13px]">
            <div className="flex items-baseline gap-2">
              <span className="text-[#9a8466]">{s.step}.</span>
              <span className="font-mono text-[12px] font-semibold text-[#2d5f78]">{s.tool}</span>
              {typeof s.args.villager_id === "string" && <span className="text-[12px] text-[#6b5040]">→ {s.args.villager_id}</span>}
            </div>
            {s.why && <div className="mt-0.5 italic text-[#6b5040]">{s.why}</div>}
            <div className="mt-1 text-[#2a1d14]">{s.summary}</div>
            {s.cypher.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[12px] font-semibold text-[#2d5f78]">Cypher ({s.cypher.map((c) => c.query).join(", ")})</summary>
                {s.cypher.map((c) => <pre key={c.query} className="cypher mt-1">{c.cypher}</pre>)}
              </details>
            )}
          </motion.div>
        ))}
        {result && (
          <div className="rounded-md border-2 border-[#5f8f4a] bg-[#5f8f4a]/10 p-3">
            <div className="font-display text-lg">Report</div>
            <p className="text-[14px]">{result.report}</p>
            <p className="mt-1 text-[11px] text-[#6b5040]">mode: {result.mode}</p>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
