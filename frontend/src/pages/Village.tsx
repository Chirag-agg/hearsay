// Village: the map with walking times, who lives where, the social web, and "village talk" (PageRank).
import { useState } from "react";
import type { GameCtx } from "../App";
import { CypherBlock, Portrait, colorOf } from "../components/bits";

const SPOTS: Record<string, [number, number]> = {
  square: [400, 250],
  tavern: [270, 160],
  smithy: [500, 140],
  herbalist: [290, 340],
  chapel: [470, 380],
  manor: [660, 210],
  riverside: [600, 440],
  mill: [740, 400],
};

export default function VillagePage({ ctx }: { ctx: GameCtx }) {
  const { village } = ctx;
  const [web, setWeb] = useState(false);
  const hub = village.gossip_hubs[0]?.id;
  const placeName = Object.fromEntries(village.places.map((p) => [p.id, p.name]));

  // Where each villager stands on the map: home or workplace; Silas lies at the Mill.
  const spotOf = (id: string, home?: string | null, work?: string | null) =>
    id === "silas" ? "mill" : work ?? home ?? (id === "pip" ? "riverside" : "square");
  const byPlace: Record<string, string[]> = {};
  village.people.forEach((p) => {
    const s = spotOf(p.id, p.lives_at, p.works_at);
    (byPlace[s] ??= []).push(p.id);
  });
  const pos: Record<string, [number, number]> = {};
  Object.entries(byPlace).forEach(([place, ids]) => {
    const [x, y] = SPOTS[place];
    ids.forEach((id, i) => {
      const angle = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
      const r = ids.length > 1 ? 34 : 0;
      pos[id] = [x + Math.cos(angle) * r, y + 46 + Math.sin(angle) * r * 0.5];
    });
  });
  const name = Object.fromEntries(village.people.map((p) => [p.id, p.name]));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-2xl">Hollowmere</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Show who knows whom
          </label>
        </div>
        <svg viewBox="0 0 860 520" className="w-full">
          <defs>
            <radialGradient id="glow">
              <stop offset="0%" stopColor="#e8a33d" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#e8a33d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M 520 520 C 560 440, 700 470, 860 360" stroke="#5b8fa8" strokeOpacity="0.25" strokeWidth="26" fill="none" />
          {village.roads.map((r) => {
            const [x1, y1] = SPOTS[r.a];
            const [x2, y2] = SPOTS[r.b];
            return (
              <g key={r.a + r.b}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5a4f43" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fill="#a89c88" fontSize="12" textAnchor="middle">
                  {r.minutes}′
                </text>
              </g>
            );
          })}
          {Object.entries(SPOTS).map(([id, [x, y]]) => (
            <g key={id}>
              <circle cx={x} cy={y} r="16" fill="#25211d" stroke={id === "mill" ? "#c2412d" : "#e8a33d"} strokeWidth="2" />
              <text x={x} y={y - 24} fill="#efe6d4" fontSize="14" textAnchor="middle" fontFamily="IM Fell English, serif">
                {placeName[id] ?? id}
              </text>
            </g>
          ))}
          {web &&
            village.knows.map((k) => {
              const [x1, y1] = pos[k.a];
              const [x2, y2] = pos[k.b];
              return (
                <line key={k.a + k.b} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8a33d" strokeOpacity={0.15 + k.closeness * 0.5}
                  strokeWidth={1 + k.closeness * 2} />
              );
            })}
          {village.people.map((p) => {
            const [x, y] = pos[p.id];
            return (
              <g key={p.id} className="cursor-pointer" onClick={() => p.id !== "silas" && ctx.goTo("Interrogate", { villager: p.id })}>
                {p.id === hub && <circle cx={x} cy={y} r="26" fill="url(#glow)" />}
                <circle cx={x} cy={y} r="13" fill={colorOf(p.id)} stroke={p.id === hub ? "#e8a33d" : "#14110f"} strokeWidth="2"
                  opacity={p.id === "silas" ? 0.45 : 1} />
                <text x={x} y={y + 25} fill="#efe6d4" fontSize="11" textAnchor="middle">
                  {p.id === "silas" ? "✝ Silas" : p.name.replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0]}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section className="space-y-4">
        <div className="card p-4">
          <div className="label">The morning briefing</div>
          <ul className="mt-2 space-y-1 text-sm">
            {village.facts.map((f) => (
              <li key={f.id}>• {f.text}</li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="label">Village talk: who hears the most gossip</div>
          <p className="mt-1 text-xs text-muted">PageRank over who-knows-whom. Start with whoever hears everything.</p>
          <ol className="mt-3 space-y-2">
            {village.gossip_hubs.map((h, i) => (
              <li key={h.id} className="flex items-center gap-3">
                <Portrait id={h.id} name={h.name} size={34} ring={i === 0 ? "#e8a33d" : undefined} />
                <div className="flex-1">
                  <div className="text-sm">
                    {h.name} {i === 0 && <span className="ml-1 rounded bg-lantern px-1.5 text-[10px] font-semibold text-ink">hears everything</span>}
                  </div>
                  <div className="h-1.5 rounded bg-edge">
                    <div className="h-1.5 rounded bg-lantern" style={{ width: `${(h.score / village.gossip_hubs[0].score) * 100}%` }} />
                  </div>
                </div>
                <button className="btn" onClick={() => ctx.goTo("Interrogate", { villager: h.id })}>
                  Ask
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <CypherBlock title="PageRank Cypher (Q4)" cypher={village.cypher.gossip_hubs} />
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Social circles (label propagation)</div>
          <ul className="mt-2 space-y-1 text-xs text-parchment/80">
            {village.circles.map((c) => (
              <li key={c.community}>{c.members.join(", ")}</li>
            ))}
          </ul>
          <div className="mt-2">
            <CypherBlock title="CDLP Cypher (Q5)" cypher={village.cypher.circles} />
          </div>
        </div>
        <div className="card p-4 text-xs text-muted">
          Click a villager on the map to question them. {Object.keys(name).length - 1} villagers, one body.
        </div>
      </section>
    </div>
  );
}
