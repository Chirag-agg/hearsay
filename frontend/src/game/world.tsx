// Hollowmere, drawn in SVG (viewBox 1600 x 900): sky and light that follow the clock, hills,
// the river, roads with walking-time signposts, and the eight places. The static parts are
// memoized; actors are drawn on top by Scene.

import { memo } from "react";

export const W = 1600;
export const H = 900;

/** Where each place's door is: villagers stand nearby, roads meet here. */
export const PLACES: Record<string, { x: number; y: number; name: string }> = {
  tavern: { x: 440, y: 300, name: "The Tavern" },
  smithy: { x: 860, y: 255, name: "Smithy" },
  manor: { x: 1290, y: 235, name: "The Manor" },
  square: { x: 760, y: 485, name: "Village Square" },
  herbalist: { x: 360, y: 625, name: "Herbalist" },
  chapel: { x: 820, y: 745, name: "Chapel" },
  riverside: { x: 1165, y: 770, name: "Riverside path" },
  mill: { x: 1420, y: 600, name: "Old Mill" },
};

/** Where each villager stands during the investigation day. */
export const STANDS: Record<string, { x: number; y: number }> = {
  bess: { x: 485, y: 338 },
  hale: { x: 680, y: 478 },
  imogen: { x: 845, y: 505 },
  tilly: { x: 735, y: 548 },
  jonas: { x: 915, y: 292 },
  wren: { x: 1240, y: 282 },
  elena: { x: 410, y: 660 },
  aldric: { x: 870, y: 785 },
  pip: { x: 1110, y: 800 },
  brann: { x: 1370, y: 650 },
};

export const PLAYER_HOME = { x: 770, y: 585 };

export type Sky = { top: string; bottom: string; light: string; lightOpacity: number; night: boolean; sun: { x: number; y: number } };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (c1: string, c2: string, t: number) => {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [a, b] = [p(c1), p(c2)];
  return `#${a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, "0")).join("")}`;
};

/** Daylight from 08:00 (progress 0) to 16:00 (progress 1); night for the title and the flashback. */
export function skyAt(progress: number, night = false): Sky {
  if (night) return { top: "#0b1026", bottom: "#27304f", light: "#1a2350", lightOpacity: 0.45, night: true, sun: { x: 1350, y: 110 } };
  const keys = [
    { t: 0, top: "#9fc3e6", bottom: "#f7d9a6", light: "#ffcf8a", o: 0.12 },
    { t: 0.45, top: "#79b2e8", bottom: "#d8ecf6", light: "#ffffff", o: 0.0 },
    { t: 1, top: "#6f8fc4", bottom: "#f2b57c", light: "#ff9a4a", o: 0.16 },
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

const ROADS: [string, string, number][] = [
  ["square", "tavern", 5], ["square", "smithy", 5], ["square", "herbalist", 5], ["square", "chapel", 10],
  ["herbalist", "chapel", 10], ["square", "manor", 15], ["manor", "mill", 15], ["chapel", "riverside", 10],
  ["riverside", "mill", 10], ["tavern", "mill", 25], ["smithy", "mill", 30],
];

function roadPath(a: string, b: string): string {
  const p = PLACES[a];
  const q = PLACES[b];
  const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.12;
  const my = (p.y + q.y) / 2 - (q.x - p.x) * 0.06;
  return `M${p.x} ${p.y + 12} Q${mx} ${my + 12} ${q.x} ${q.y + 12}`;
}

function Tree({ x, y, s = 1, tone = 0 }: { x: number; y: number; s?: number; tone?: number }) {
  const greens = ["#4f7a3a", "#5d8a44", "#476e36", "#6a9450"];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="22" ry="6" fill="#000" opacity="0.18" />
      <rect x="-4" y="-28" width="8" height="30" rx="2" fill="#5a3f28" />
      <circle cx="-12" cy="-38" r="17" fill={greens[tone % 4]} />
      <circle cx="12" cy="-40" r="18" fill={greens[(tone + 1) % 4]} />
      <circle cx="0" cy="-56" r="19" fill={greens[(tone + 2) % 4]} />
      <circle cx="-6" cy="-60" r="7" fill="#fff" opacity="0.08" />
    </g>
  );
}

function Smoke({ x, y, dark = false }: { x: number; y: number; dark?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={dark ? "#6b6560" : "#d8d4cc"}>
      {[0, 1, 2].map((i) => (
        <circle key={i} className="smoke" style={{ animationDelay: `${i * 1.3}s` }} cx="0" cy="0" r={7 + i * 2} />
      ))}
    </g>
  );
}

function Window({ x, y, w = 14, h = 16, lit }: { x: number; y: number; w?: number; h?: number; lit: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2" fill={lit ? "#ffd27a" : "#5d6f80"} className={lit ? "window-lit" : ""} />
      <path d={`M${x + w / 2} ${y} v${h} M${x} ${y + h / 2} h${w}`} stroke="#3a2a1e" strokeWidth="1.5" />
    </g>
  );
}

function Tavern({ night }: { night: boolean }) {
  return (
    <g transform="translate(440 300)">
      <ellipse cx="0" cy="0" rx="110" ry="16" fill="#000" opacity="0.15" />
      <rect x="-95" y="-115" width="190" height="115" fill="#d7b98a" />
      <path d="M-95 -60 h190 M-95 -115 v115 M95 -115 v115 M-30 -115 v115 M30 -115 v115" stroke="#5a3a22" strokeWidth="6" />
      <path d="M-95 -115 L-60 -90 M30 -115 L60 -90" stroke="#5a3a22" strokeWidth="4" />
      <path d="M-112 -112 L0 -178 L112 -112 Z" fill="#8a3e2c" />
      <path d="M-112 -112 L0 -178 L112 -112" stroke="#5e2a1e" strokeWidth="5" fill="none" />
      <rect x="40" y="-200" width="20" height="45" fill="#7a5a48" />
      <Smoke x={50} y={-205} />
      <Window x={-82} y={-100} lit={night} />
      <Window x={-56} y={-100} lit={night} />
      <Window x={44} y={-100} lit={night} />
      <Window x={68} y={-100} lit={night} />
      <Window x={-82} y={-45} w={20} h={22} lit />
      <Window x={62} y={-45} w={20} h={22} lit />
      <rect x="-17" y="-52" width="34" height="52" rx="16" fill="#5a3a22" />
      <circle cx="10" cy="-26" r="2" fill="#d9b44a" />
      <g transform="translate(-118 -88)">
        <path d="M0 0 h-2 v-14 h30" stroke="#3a2a1e" strokeWidth="3" fill="none" />
        <g className="sway">
          <rect x="6" y="2" width="26" height="22" rx="3" fill="#7a5230" stroke="#3a2a1e" strokeWidth="2" />
          <path d="M13 8 h10 v10 h-10 Z M23 10 q5 0 5 4 q0 4 -5 4" fill="#f0d27a" stroke="#3a2a1e" strokeWidth="1.2" />
        </g>
      </g>
      <g transform="translate(70 -2)"><ellipse cx="0" cy="-10" rx="11" ry="13" fill="#8a5a30" /><path d="M-11 -14 h22 M-11 -4 h22" stroke="#4a3020" strokeWidth="2" /></g>
    </g>
  );
}

function Smithy({ night }: { night: boolean }) {
  return (
    <g transform="translate(860 255)">
      <ellipse cx="0" cy="0" rx="100" ry="14" fill="#000" opacity="0.15" />
      <rect x="-80" y="-95" width="160" height="95" fill="#8d8780" />
      <g fill="#7a746d">
        {[-70, -30, 10, 50].map((x) => [-85, -60, -35].map((y) => <rect key={`${x}${y}`} x={x + (y % 2 ? 6 : 0)} y={y} width="26" height="14" rx="2" />))}
      </g>
      <path d="M-95 -92 L0 -150 L95 -92 Z" fill="#3e3a38" />
      <rect x="-70" y="-185" width="28" height="70" fill="#5c5753" />
      <Smoke x={-56} y={-190} dark />
      <rect x="-20" y="-70" width="62" height="70" fill="#2a1d14" />
      <rect x="-14" y="-40" width="50" height="34" fill="#ff7a2a" className="forge" />
      <Window x={-62} y={-70} lit={night} />
      <g transform="translate(60 -6)"><path d="M-14 0 h28 l-4 -8 h-20 Z M-8 -8 v-6 h22 l-4 -6 h-28 v6 Z" fill="#2c2c2e" /></g>
    </g>
  );
}

function Manor({ night }: { night: boolean }) {
  return (
    <g transform="translate(1290 235)">
      <ellipse cx="0" cy="2" rx="190" ry="20" fill="#000" opacity="0.15" />
      <rect x="-170" y="-110" width="80" height="110" fill="#dcd2c2" />
      <rect x="90" y="-110" width="80" height="110" fill="#dcd2c2" />
      <rect x="-90" y="-150" width="180" height="150" fill="#e5dccd" />
      <path d="M-185 -108 L-130 -150 L-75 -108 Z M75 -108 L130 -150 L185 -108 Z" fill="#4f5a6b" />
      <path d="M-105 -148 L0 -210 L105 -148 Z" fill="#45505f" />
      <rect x="55" y="-230" width="18" height="50" fill="#9a8f80" />
      <Smoke x={64} y={-234} />
      {[-70, -35, 20, 55].map((x) => <Window key={x} x={x} y={-130} w={16} h={22} lit={night} />)}
      {[-70, 55].map((x) => <Window key={x} x={x} y={-80} w={16} h={22} lit={night} />)}
      {[-155, -120, 105, 140].map((x) => <Window key={x} x={x} y={-85} w={14} h={20} lit={night} />)}
      <rect x="-18" y="-60" width="36" height="60" rx="18" fill="#3a3040" />
      <path d="M-30 -60 h60" stroke="#c9bfae" strokeWidth="6" />
      {[-200, -150, 150, 200].map((x) => <rect key={x} x={x} y="-14" width="40" height="16" rx="7" fill="#3d6a35" />)}
    </g>
  );
}

function Square() {
  return (
    <g transform="translate(760 485)">
      <ellipse cx="0" cy="10" rx="190" ry="70" fill="#b7a78a" />
      <ellipse cx="0" cy="10" rx="190" ry="70" fill="url(#cobbles)" opacity="0.7" />
      <g transform="translate(0 6)">
        <ellipse cx="0" cy="0" rx="30" ry="12" fill="#6e6a64" />
        <rect x="-30" y="-24" width="60" height="24" fill="#8a857e" />
        <ellipse cx="0" cy="-24" rx="30" ry="10" fill="#4a5f78" />
        <path d="M-26 -24 v-34 M26 -24 v-34" stroke="#5a3a22" strokeWidth="4" />
        <path d="M-36 -56 L0 -78 L36 -56 Z" fill="#8a3e2c" />
        <path d="M0 -58 v18" stroke="#3a2a1e" strokeWidth="1.5" />
        <rect x="-5" y="-40" width="10" height="8" fill="#7a5230" />
      </g>
      <g transform="translate(-130 -30)">
        <rect x="-3" y="-10" width="6" height="40" fill="#5a3a22" />
        <rect x="-24" y="-40" width="48" height="32" fill="#8a6440" stroke="#5a3a22" strokeWidth="3" />
        <rect x="-18" y="-35" width="14" height="18" fill="#efe6d4" />
        <rect x="0" y="-34" width="16" height="12" fill="#efe6d4" />
      </g>
    </g>
  );
}

function Herbalist({ night }: { night: boolean }) {
  return (
    <g transform="translate(360 625)">
      <ellipse cx="0" cy="0" rx="100" ry="14" fill="#000" opacity="0.15" />
      <rect x="-70" y="-85" width="140" height="85" fill="#e3d6bd" />
      <path d="M-88 -80 Q-80 -140 0 -150 Q80 -140 88 -80 Z" fill="#c9a35a" />
      <path d="M-80 -95 Q0 -110 80 -95 M-70 -115 Q0 -130 70 -115" stroke="#a8843e" strokeWidth="3" fill="none" />
      <rect x="-14" y="-50" width="28" height="50" rx="3" fill="#3f6b3a" />
      <Window x={-55} y={-60} w={22} h={20} lit={night} />
      <Window x={33} y={-60} w={22} h={20} lit={night} />
      <g transform="translate(-30 -40)">{[0, 8, 16].map((x) => <path key={x} d={`M${x} 0 v10`} stroke="#5f8f4a" strokeWidth="3" />)}</g>
      {[[-120, 10], [-95, 18], [95, 14], [120, 6], [110, -20]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="0" rx="14" ry="6" fill="#5f8f4a" />
          <circle cx="-5" cy="-4" r="3" fill={["#d98aa0", "#e8c24a", "#8a6b9e", "#f3eee2", "#d98aa0"][i]} />
          <circle cx="5" cy="-3" r="2.5" fill={["#e8c24a", "#d98aa0", "#f3eee2", "#8a6b9e", "#e8c24a"][i]} />
        </g>
      ))}
    </g>
  );
}

function Chapel({ night }: { night: boolean }) {
  return (
    <g transform="translate(820 745)">
      <ellipse cx="0" cy="0" rx="110" ry="15" fill="#000" opacity="0.15" />
      <rect x="-80" y="-90" width="160" height="90" fill="#ece6d8" />
      <path d="M-95 -86 L0 -135 L95 -86 Z" fill="#59544c" />
      <rect x="-26" y="-190" width="52" height="105" fill="#e5dfd0" />
      <path d="M-34 -188 L0 -250 L34 -188 Z" fill="#4c4740" />
      <path d="M0 -268 v-22 M-8 -282 h16" stroke="#d9b44a" strokeWidth="3" />
      <circle cx="0" cy="-160" r="11" fill="#3a3530" />
      <path d="M-6 -160 q6 -10 12 0 v6 h-12 Z" fill="#c9a24a" className="bell" />
      <circle cx="0" cy="-112" r="16" fill={night ? "#ffd27a" : "#5a7fae"} />
      <path d="M0 -128 v32 M-16 -112 h32" stroke="#3a3530" strokeWidth="2" />
      <rect x="-15" y="-55" width="30" height="55" rx="15" fill="#5a3a22" />
      <Window x={-62} y={-65} w={14} h={26} lit={night} />
      <Window x={48} y={-65} w={14} h={26} lit={night} />
      {[[-140, 6], [-118, 14], [130, 8], [152, 16]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}><path d="M-7 0 v-16 q7 -8 14 0 v16 Z" fill="#9a958c" /><path d="M0 -14 v8 M-3 -11 h6" stroke="#6e6a64" strokeWidth="1.5" /></g>
      ))}
    </g>
  );
}

function Riverside({ night }: { night: boolean }) {
  return (
    <g transform="translate(1165 770)">
      <g transform="translate(-60 8)">
        <rect x="-26" y="-14" width="52" height="7" rx="2" fill="#8a6440" />
        <rect x="-26" y="-26" width="52" height="5" rx="2" fill="#8a6440" />
        <path d="M-22 -7 v9 M22 -7 v9 M-20 -26 v12 M20 -26 v12" stroke="#5a3a22" strokeWidth="3" />
      </g>
      <g transform="translate(40 0)">
        <rect x="-2.5" y="-90" width="5" height="92" fill="#2e2a26" />
        <rect x="-8" y="-104" width="16" height="16" rx="3" fill={night ? "#ffd27a" : "#cbbf9d"} stroke="#2e2a26" strokeWidth="2" />
        {night && <circle cx="0" cy="-96" r="30" fill="#ffd27a" opacity="0.18" className="flicker" />}
      </g>
      {[-120, -105, 95, 112, 128].map((x, i) => (
        <path key={x} d={`M${x} 30 q-3 -22 ${i % 2 ? 4 : -4} -34`} stroke="#6a8a4a" strokeWidth="3" fill="none" className="reed" />
      ))}
    </g>
  );
}

function Mill() {
  return (
    <g transform="translate(1420 600)">
      <ellipse cx="0" cy="0" rx="110" ry="15" fill="#000" opacity="0.15" />
      <rect x="-80" y="-120" width="130" height="120" fill="#8a6a4a" />
      <path d="M-80 -90 h130 M-80 -60 h130 M-80 -30 h130" stroke="#6e5238" strokeWidth="3" />
      <path d="M-96 -116 L-15 -175 L66 -116 Z" fill="#5a4030" />
      <rect x="-30" y="-58" width="30" height="58" fill="#3a2a1e" />
      <path d="M-30 -58 l30 58 M0 -58 l-30 58" stroke="#8a6a4a" strokeWidth="3" />
      <g transform="translate(78 -50)">
        <g className="wheel">
          <circle cx="0" cy="0" r="48" fill="none" stroke="#5a3f28" strokeWidth="7" />
          <circle cx="0" cy="0" r="8" fill="#5a3f28" />
          {[0, 30, 60, 90, 120, 150].map((a) => (
            <rect key={a} x="-3" y="-50" width="6" height="100" fill="#6e5238" transform={`rotate(${a})`} />
          ))}
        </g>
      </g>
      <g transform="translate(-10 40)" opacity="0.9">
        <path d="M-22 4 q-6 -12 4 -16 q2 -12 12 -8 q8 -10 14 2 q14 0 10 12 q8 6 -2 10 q-12 6 -22 2 q-12 4 -16 -2 Z"
          fill="none" stroke="#f3eee2" strokeWidth="2.5" strokeDasharray="5 3" />
      </g>
    </g>
  );
}

function Signpost({ place }: { place: string }) {
  const p = PLACES[place];
  const label = p.name;
  const w = label.length * 7.4 + 20;
  return (
    <g transform={`translate(${p.x} ${p.y + 46})`}>
      <rect x="-2" y="-6" width="4" height="22" fill="#5a3a22" />
      <rect x={-w / 2} y="-24" width={w} height="20" rx="4" fill="#7a5230" stroke="#4a3020" strokeWidth="2" />
      <text x="0" y="-9.5" textAnchor="middle" fontSize="13" fill="#f3e6c8" fontFamily="IM Fell English, serif">{label}</text>
    </g>
  );
}

export const World = memo(function World({ sky }: { sky: Sky }) {
  const night = sky.night;
  return (
    <g>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky.top} />
          <stop offset="100%" stopColor={sky.bottom} />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={night ? "#2c3d2c" : "#9bbf6a"} />
          <stop offset="100%" stopColor={night ? "#1a261c" : "#7ea457"} />
        </linearGradient>
        <linearGradient id="river" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={night ? "#1e3550" : "#5b9cc0"} />
          <stop offset="100%" stopColor={night ? "#16283e" : "#3f7fa8"} />
        </linearGradient>
        <pattern id="cobbles" width="18" height="12" patternUnits="userSpaceOnUse">
          <rect width="18" height="12" fill="none" />
          <ellipse cx="5" cy="4" rx="4" ry="2.6" fill="#9a8a6e" />
          <ellipse cx="14" cy="9" rx="4" ry="2.6" fill="#a6967a" />
        </pattern>
        <radialGradient id="sunglow">
          <stop offset="0%" stopColor={night ? "#f3f0dc" : "#fff6d0"} stopOpacity="0.9" />
          <stop offset="100%" stopColor={night ? "#f3f0dc" : "#fff6d0"} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#sky)" />
      {night && Array.from({ length: 60 }, (_, i) => (
        <circle key={i} className="twinkle" style={{ animationDelay: `${(i % 7) * 0.6}s` }}
          cx={(i * 263) % W} cy={(i * 97) % 200} r={i % 5 === 0 ? 1.6 : 1} fill="#fff" />
      ))}
      <circle cx={sky.sun.x} cy={sky.sun.y} r="90" fill="url(#sunglow)" />
      <circle cx={sky.sun.x} cy={sky.sun.y} r={night ? 26 : 34} fill={night ? "#ecebdc" : "#fff1b8"} />
      <g className="clouds" opacity={night ? 0.25 : 0.85} fill="#fff">
        <g className="cloud" style={{ animationDuration: "140s" }}><ellipse cx="200" cy="95" rx="70" ry="20" /><ellipse cx="240" cy="80" rx="45" ry="22" /></g>
        <g className="cloud" style={{ animationDuration: "190s", animationDelay: "-60s" }}><ellipse cx="900" cy="70" rx="80" ry="18" /><ellipse cx="940" cy="58" rx="45" ry="20" /></g>
      </g>

      <path d="M0 230 Q200 150 420 210 T860 190 T1300 150 T1600 190 V420 H0 Z" fill={night ? "#1f2b3c" : "#9ab4a0"} />
      <path d="M0 280 Q260 210 520 260 T1040 230 T1600 250 V460 H0 Z" fill={night ? "#243424" : "#8bb072"} />
      <path d="M0 330 Q400 270 800 310 T1600 300 V900 H0 Z" fill="url(#grass)" />

      <path d="M1600 330 Q1520 420 1505 520 Q1490 640 1330 720 Q1210 790 1150 900 L1270 900 Q1320 820 1420 760 Q1600 660 1600 520 Z"
        fill="url(#river)" />
      <path d="M1580 360 Q1510 450 1500 540 Q1480 650 1340 735 Q1240 800 1200 890" stroke="#d8ecf6" strokeOpacity={night ? 0.25 : 0.5}
        strokeWidth="3" fill="none" strokeDasharray="14 22" className="flow" />
      <path d="M1250 860 Q1300 860 1350 845" stroke="#7a5230" strokeWidth="14" fill="none" />

      {ROADS.map(([a, b]) => (
        <g key={a + b}>
          <path d={roadPath(a, b)} stroke={night ? "#4a4236" : "#c9ae7c"} strokeWidth="24" fill="none" strokeLinecap="round" />
          <path d={roadPath(a, b)} stroke={night ? "#5a5040" : "#dcc493"} strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray="2 14" />
        </g>
      ))}
      {ROADS.map(([a, b, minutes]) => {
        const p = PLACES[a];
        const q = PLACES[b];
        const x = (p.x + q.x) / 2 + (q.y - p.y) * 0.06;
        const y = (p.y + q.y) / 2 - (q.x - p.x) * 0.03 + 12;
        return (
          <g key={`m${a}${b}`} transform={`translate(${x} ${y})`}>
            <circle r="13" fill="#f3e6c8" stroke="#7a5230" strokeWidth="2" />
            <text y="4.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="#4a3020">{minutes}′</text>
          </g>
        );
      })}

      {[[120, 360, 1.1, 0], [210, 420, 0.9, 1], [600, 370, 1, 2], [1080, 330, 1.05, 3], [1010, 420, 0.9, 1], [160, 720, 1.2, 2],
        [560, 820, 1, 0], [640, 650, 0.85, 3], [990, 600, 0.95, 2], [1530, 300, 1, 1], [260, 860, 1.1, 3], [1000, 880, 1, 0],
        [1180, 420, 0.9, 2], [80, 560, 1.15, 1]].map(([x, y, s, t], i) => <Tree key={i} x={x} y={y} s={s} tone={t} />)}

      <Manor night={night} />
      <Tavern night={night} />
      <Smithy night={night} />
      <Square />
      <Herbalist night={night} />
      <Chapel night={night} />
      <Riverside night={night} />
      <Mill />
      {Object.keys(PLACES).map((p) => <Signpost key={p} place={p} />)}
    </g>
  );
});

/** Light over everything: warm morning, flat noon, golden afternoon, blue night. */
export function Lighting({ sky }: { sky: Sky }) {
  return <rect width={W} height={H} fill={sky.light} opacity={sky.lightOpacity * 0.8} style={{ pointerEvents: "none" }} />;
}
