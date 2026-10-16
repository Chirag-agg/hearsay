// Hollowmere: a Liberated Pixel Cup tile map (built by scripts/build_village.py; credits in
// public/tiles/CREDITS.md) shown at 1.25 world units per pixel in a 1600 x 900 viewBox. On top of it:
// the windmill turning, lamps that glow at night, cloud shadows, name plates and walking times,
// and light that follows the clock. Actors are drawn on top by Scene.

import { memo, useEffect, useState } from "react";
import VILLAGE from "./village.json";

export const W = 1600;
export const H = 900;

const NAMES: Record<string, string> = {
  tavern: "The Tavern", smithy: "Smithy", manor: "The Manor", square: "Village Square",
  herbalist: "Herbalist", chapel: "Chapel", riverside: "Riverside path", mill: "Old Mill",
};

/** Where each place's door is: villagers stand nearby, roads meet here. */
export const PLACES: Record<string, { x: number; y: number; name: string }> = Object.fromEntries(
  Object.entries(VILLAGE.places).map(([id, p]) => [id, { ...p, name: NAMES[id] ?? id }]),
);

/** Where each villager stands during the investigation day. */
export const STANDS: Record<string, { x: number; y: number }> = VILLAGE.stands;

export const PLAYER_HOME = VILLAGE.playerHome;

export type Sky = { top: string; bottom: string; light: string; lightOpacity: number; night: boolean; sun: { x: number; y: number } };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (c1: string, c2: string, t: number) => {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [a, b] = [p(c1), p(c2)];
  return `#${a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, "0")).join("")}`;
};

/** Daylight from 08:00 (progress 0) to 16:00 (progress 1); night for the title and the flashback. */
export function skyAt(progress: number, night = false): Sky {
  if (night) return { top: "#0b1026", bottom: "#27304f", light: "#141c44", lightOpacity: 0.7, night: true, sun: { x: 1350, y: 110 } };
  const keys = [
    { t: 0, top: "#9fc3e6", bottom: "#f7d9a6", light: "#ffcf8a", o: 0.14 },
    { t: 0.45, top: "#79b2e8", bottom: "#d8ecf6", light: "#ffffff", o: 0.0 },
    { t: 1, top: "#6f8fc4", bottom: "#f2b57c", light: "#ff9a4a", o: 0.2 },
  ];
  const i = progress < 0.45 ? 0 : 1;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (progress - a.t) / (b.t - a.t);
  return {
    top: mix(a.top, b.top, t),
    bottom: mix(a.bottom, b.bottom, t),
    light: mix(a.light, b.light, t),
    lightOpacity: lerp(a.o, b.o, t),
    night: false,
    sun: { x: lerp(260, 1380, progress), y: 150 - Math.sin(progress * Math.PI) * 95 },
  };
}

/** Walking times on the roads drawn on the map. */
const ROADS: [string, string, number][] = [
  ["square", "tavern", 5], ["square", "smithy", 5], ["square", "herbalist", 5], ["square", "chapel", 10],
  ["herbalist", "chapel", 10], ["square", "manor", 15], ["manor", "mill", 15], ["chapel", "riverside", 10],
  ["riverside", "mill", 10],
];

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** Drawn above passers-by (by Scene): anyone walking behind the mill passes under its sails. */
export function Windmill() {
  const m = VILLAGE.windmill;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setFrame((f) => (f + 1) % m.frames), 220);
    return () => window.clearInterval(t);
  }, [m.frames]);
  const fw = m.width / VILLAGE.map.scale;
  const fh = m.height / VILLAGE.map.scale;
  return (
    <svg x={m.x} y={m.y} width={m.width} height={m.height} viewBox={`${frame * fw} 0 ${fw} ${fh}`}>
      <image href={asset("tiles/windmill.png")} width={fw * m.frames} height={fh} style={{ imageRendering: "pixelated" }} />
    </svg>
  );
}

function Signpost({ place }: { place: string }) {
  const p = PLACES[place];
  const label = p.name;
  const w = label.length * 6.6 + 18;
  return (
    <g transform={`translate(${p.x} ${p.y + 40})`}>
      <rect x={-w / 2} y="-11" width={w} height="18" rx="4" fill="#5a3a22" opacity="0.88" stroke="#2e1f14" strokeWidth="1.5" />
      <text x="0" y="2.5" textAnchor="middle" fontSize="11.5" fill="#f3e6c8" fontFamily="IM Fell English, serif">{label}</text>
    </g>
  );
}

export const World = memo(function World({ sky }: { sky: Sky }) {
  const night = sky.night;
  return (
    <g>
      <image href={asset("tiles/village.png")} width={W} height={H} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} />
      {/* cloud shadows drifting over the village */}
      {!night && [0, 1, 2].map((k) => (
        <ellipse key={k} className="cloud-shadow" style={{ animationDelay: `${k * -50}s` }} cx="0" cy={180 + k * 280} rx="220" ry="70" fill="#14240f" opacity="0.1" />
      ))}
      {ROADS.map(([a, b, minutes]) => {
        const p = PLACES[a];
        const q = PLACES[b];
        const x = (p.x + q.x) / 2 + (q.y - p.y) * 0.06;
        const y = (p.y + q.y) / 2 - (q.x - p.x) * 0.03 + 12.5;
        return (
          <g key={`m${a}${b}`} transform={`translate(${x} ${y})`} opacity="0.92">
            <circle r="11" fill="#f3e6c8" stroke="#5a3a22" strokeWidth="1.5" />
            <text y="4" textAnchor="middle" fontSize="10" fontWeight="600" fill="#4a3020">{minutes}′</text>
          </g>
        );
      })}
      {Object.keys(PLACES).map((p) => <Signpost key={p} place={p} />)}
    </g>
  );
});

/** Light over everything: warm morning, flat noon, golden afternoon, blue night with lamps lit. */
export function Lighting({ sky }: { sky: Sky }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect width={W} height={H} fill={sky.light} opacity={sky.night ? sky.lightOpacity : sky.lightOpacity * 0.8} />
      {sky.night && (
        <>
          <defs>
            <radialGradient id="lampglow">
              <stop offset="0%" stopColor="#ffe6a8" stopOpacity="0.75" />
              <stop offset="25%" stopColor="#ffc96b" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#ffb04a" stopOpacity="0" />
            </radialGradient>
          </defs>
          {VILLAGE.lamps.map((l, i) => <circle key={i} cx={l.x} cy={l.y + 30} r="95" fill="url(#lampglow)" className="flicker" />)}
        </>
      )}
    </g>
  );
}
