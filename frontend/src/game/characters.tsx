// The cast, drawn in SVG. One parameterized figure (origin at the feet, about 100 units tall)
// covers every villager, the player and the inspector; the same drawing is the dialogue portrait.

export type HairStyle = "short" | "bun" | "long" | "pigtails" | "bald" | "scruffy";
export type Hat = "none" | "wide" | "cap" | "helmet" | "feathered" | "tattered" | "bowler" | "tophat";
export type Extra = "apron" | "leather" | "collar" | "bag" | "basket" | "bottle" | "lantern" | "shawl" | "spectacles"
  | "beard" | "mustache" | "scarf" | "glass" | "cross" | "flour" | "buttons";

export type Look = {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  bottom: string;
  dress?: boolean; // long skirt or robe instead of trousers
  hat?: Hat;
  hatColor?: string;
  extras?: Extra[];
  scale?: number; // children are smaller
  width?: number; // build: 1 = medium
};

export const LOOKS: Record<string, Look> = {
  elena: { skin: "#e6c09c", hair: "#6b2f1d", hairStyle: "long", top: "#4f7a4a", bottom: "#2f4a2e", dress: true,
    extras: ["shawl", "basket"], width: 0.92 },
  jonas: { skin: "#d6a272", hair: "#1d1a17", hairStyle: "short", top: "#8a5a35", bottom: "#3a3634",
    extras: ["leather", "beard"], width: 1.25 },
  wren: { skin: "#f1d6c0", hair: "#d8b56a", hairStyle: "bun", top: "#2d4f8a", bottom: "#24406f", dress: true,
    hat: "feathered", hatColor: "#2a2a4a", scale: 1.05, width: 0.95 },
  bess: { skin: "#f0c6a4", hair: "#b5532c", hairStyle: "bun", top: "#e8dcc0", bottom: "#6b4a2e", dress: true,
    extras: ["apron"], width: 1.2 },
  pip: { skin: "#dcac8a", hair: "#7d7364", hairStyle: "scruffy", top: "#6b6b3a", bottom: "#4a4a3a",
    hat: "tattered", hatColor: "#5a4632", extras: ["bottle"], width: 0.9 },
  aldric: { skin: "#e8c8a8", hair: "#b8b2a8", hairStyle: "bald", top: "#1e1e24", bottom: "#1e1e24", dress: true,
    extras: ["collar", "cross"], width: 1 },
  tilly: { skin: "#f3d2b8", hair: "#7a4a2a", hairStyle: "pigtails", top: "#d98aa0", bottom: "#c4728a", dress: true,
    scale: 0.72, width: 0.85 },
  hale: { skin: "#e5b994", hair: "#5a3a22", hairStyle: "short", top: "#2a3a66", bottom: "#1f2a44",
    hat: "helmet", hatColor: "#1f2a44", extras: ["mustache", "buttons"], width: 1.2 },
  brann: { skin: "#dcae88", hair: "#8d8d86", hairStyle: "short", top: "#b8a882", bottom: "#5a4a3a",
    hat: "cap", hatColor: "#6b5a3a", extras: ["flour"], width: 1.2 },
  imogen: { skin: "#c48c66", hair: "#1a1414", hairStyle: "bun", top: "#2f5d5a", bottom: "#253838", dress: true,
    extras: ["spectacles", "bag"], width: 0.95 },
  silas: { skin: "#e2c2a2", hair: "#9a9590", hairStyle: "short", top: "#2a2522", bottom: "#2a2522",
    hat: "tophat", hatColor: "#141210", width: 1.1 },
  elenaNight: { skin: "#e6c09c", hair: "#6b2f1d", hairStyle: "long", top: "#2f3a2e", bottom: "#1f2a1e", dress: true,
    extras: ["shawl", "lantern"], width: 0.92 },
  player: { skin: "#e4bc98", hair: "#3a2a1e", hairStyle: "short", top: "#3a2f28", bottom: "#2a221c",
    hat: "wide", hatColor: "#2a221c", extras: ["scarf", "lantern"], width: 1 },
  inspector: { skin: "#dfb48e", hair: "#4a4a4a", hairStyle: "short", top: "#5a5a62", bottom: "#3a3a40",
    hat: "bowler", hatColor: "#141414", extras: ["glass", "mustache"], width: 1.05 },
};

const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

function HairBack({ look }: { look: Look }) {
  const c = look.hair;
  switch (look.hairStyle) {
    case "long":
      return <path d="M-13 -86 Q-16 -60 -12 -52 L12 -52 Q16 -60 13 -86 Z" fill={c} />;
    case "pigtails":
      return (
        <g fill={c}>
          <ellipse cx="-15" cy="-74" rx="4" ry="9" />
          <ellipse cx="15" cy="-74" rx="4" ry="9" />
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ look }: { look: Look }) {
  const c = look.hair;
  switch (look.hairStyle) {
    case "bald":
      return <path d="M-12 -80 Q-13 -76 -11 -72 M12 -80 Q13 -76 11 -72" stroke={c} strokeWidth="4" strokeLinecap="round" fill="none" />;
    case "bun":
      return (
        <g fill={c}>
          <path d="M-12.5 -82 Q-12 -96 0 -96 Q12 -96 12.5 -82 Q6 -90 0 -89 Q-6 -90 -12.5 -82 Z" />
          {!look.hat && <circle cx="0" cy="-99" r="6" />}
        </g>
      );
    case "scruffy":
      return <path d="M-13 -80 L-14 -88 L-9 -86 L-7 -93 L-2 -89 L2 -95 L5 -89 L10 -92 L11 -86 L14 -87 L13 -80 Q0 -88 -13 -80 Z" fill={c} />;
    case "long":
    case "pigtails":
      return <path d="M-12.5 -80 Q-12 -96 0 -96 Q12 -96 12.5 -80 Q10 -88 4 -89 Q-2 -86 -12.5 -80 Z" fill={c} />;
    default:
      return <path d="M-12.5 -82 Q-12 -96 0 -96 Q12 -96 12.5 -82 Q8 -88 0 -88 Q-8 -88 -12.5 -82 Z" fill={c} />;
  }
}

function HatShape({ look }: { look: Look }) {
  const c = look.hatColor ?? "#222";
  switch (look.hat) {
    case "wide":
      return (
        <g fill={c}>
          <ellipse cx="0" cy="-90" rx="20" ry="4.5" />
          <path d="M-11 -90 Q-11 -104 0 -104 Q11 -104 11 -90 Z" />
          <rect x="-11" y="-94" width="22" height="2.5" fill="#6b1f1a" />
        </g>
      );
    case "feathered":
      return (
        <g>
          <ellipse cx="0" cy="-92" rx="17" ry="4" fill={c} />
          <path d="M-9 -92 Q-9 -102 0 -102 Q9 -102 9 -92 Z" fill={c} />
          <path d="M6 -100 Q18 -114 24 -108 Q16 -106 8 -98 Z" fill="#c9b37a" />
        </g>
      );
    case "cap":
      return <path d="M-13 -88 Q-12 -99 0 -99 Q12 -99 13 -88 L19 -86 L13 -85 Z" fill={c} />;
    case "helmet":
      return (
        <g fill={c}>
          <path d="M-12 -86 Q-14 -108 0 -110 Q14 -108 12 -86 Z" />
          <ellipse cx="0" cy="-86" rx="15" ry="3" />
          <circle cx="0" cy="-98" r="2.6" fill="#d9b44a" />
        </g>
      );
    case "tattered":
      return (
        <g fill={c}>
          <path d="M-16 -88 L16 -88 L14 -85 L-15 -85 Z" />
          <path d="M-10 -88 Q-11 -101 -1 -101 L4 -97 L9 -100 Q11 -94 10 -88 Z" />
        </g>
      );
    case "bowler":
      return (
        <g fill={c}>
          <ellipse cx="0" cy="-89" rx="16" ry="3.5" />
          <path d="M-10 -89 Q-11 -103 0 -103 Q11 -103 10 -89 Z" />
        </g>
      );
    case "tophat":
      return (
        <g fill={c}>
          <ellipse cx="0" cy="-90" rx="16" ry="3.5" />
          <rect x="-10" y="-112" width="20" height="22" rx="2" />
        </g>
      );
    default:
      return null;
  }
}

export function Figure({ look, walking = false, talking = false, facing = 1 }: {
  look: Look;
  walking?: boolean;
  talking?: boolean;
  facing?: 1 | -1;
}) {
  const w = look.width ?? 1;
  const ex = new Set(look.extras ?? []);
  const torso = `M${-11 * w} -70 Q${-13 * w} -50 ${-12 * w} -32 L${12 * w} -32 Q${13 * w} -50 ${11 * w} -70 Q0 -74 ${-11 * w} -70 Z`;
  return (
    <g className={walking ? "walking" : "idle"} transform={`scale(${(look.scale ?? 1) * facing} ${look.scale ?? 1})`}>
      <ellipse cx="0" cy="0" rx={16 * w} ry="4.5" fill="#000" opacity="0.28" />
      <g className="breathe">
        {/* legs or skirt */}
        {look.dress ? (
          <path d={`M${-12 * w} -36 L${-17 * w} -2 Q0 2 ${17 * w} -2 L${12 * w} -36 Z`} fill={look.bottom} />
        ) : (
          <g fill={look.bottom}>
            <rect className="leg-l" x={-9 * w} y="-34" width={7.5 * w} height="33" rx="3" />
            <rect className="leg-r" x={1.5 * w} y="-34" width={7.5 * w} height="33" rx="3" />
            <ellipse cx={-5.5 * w} cy="-1" rx={5.5 * w} ry="2.6" fill="#1b1612" />
            <ellipse cx={5.5 * w} cy="-1" rx={5.5 * w} ry="2.6" fill="#1b1612" />
          </g>
        )}
        <HairBack look={look} />
        {/* arms */}
        <g fill={shade(look.top, -0.06)}>
          <rect className="arm-l" x={-17 * w} y="-68" width={6.5} height="30" rx="3.2" />
          <rect className="arm-r" x={10.5 * w} y="-68" width={6.5} height="30" rx="3.2" />
        </g>
        <path d={torso} fill={look.top} />
        {ex.has("buttons") && [0, 1, 2].map((i) => <circle key={i} cx="0" cy={-62 + i * 9} r="1.4" fill="#d9b44a" />)}
        {ex.has("flour") && <g fill="#fff" opacity="0.45"><circle cx="-5" cy="-55" r="2" /><circle cx="4" cy="-45" r="2.5" /><circle cx="7" cy="-60" r="1.5" /></g>}
        {ex.has("apron") && <path d={`M${-8 * w} -54 L${8 * w} -54 L${11 * w} -10 L${-11 * w} -10 Z`} fill="#f3eee2" opacity="0.95" />}
        {ex.has("leather") && <path d={`M${-9 * w} -62 L${9 * w} -62 L${10 * w} -20 L${-10 * w} -20 Z`} fill="#4a3020" />}
        {ex.has("shawl") && <path d={`M${-13 * w} -70 L${13 * w} -70 L0 -48 Z`} fill="#8a6b9e" />}
        {ex.has("collar") && <rect x="-4" y="-73" width="8" height="4" rx="1" fill="#f5f5f0" />}
        {ex.has("cross") && <path d="M0 -60 v10 M-3.5 -56 h7" stroke="#d9b44a" strokeWidth="1.8" />}
        {ex.has("scarf") && <path d="M-9 -72 Q0 -66 9 -72 L9 -68 Q0 -62 -9 -68 Z M4 -68 L7 -54 L2 -55 Z" fill="#8a2a22" />}
        {/* hands and props */}
        <circle cx={-14 * w} cy="-37" r="3.3" fill={look.skin} />
        <circle cx={14 * w} cy="-37" r="3.3" fill={look.skin} />
        {ex.has("basket") && <g transform={`translate(${-18 * w} -34)`}><path d="M-7 0 h14 l-2 8 h-10 Z" fill="#a0763f" /><path d="M-6 0 q6 -9 12 0" stroke="#a0763f" fill="none" strokeWidth="1.5" /><circle cx="-3" cy="-1" r="2.5" fill="#5f8f4a" /><circle cx="2" cy="-2" r="2.5" fill="#7fae5a" /></g>}
        {ex.has("bag") && <g transform={`translate(${17 * w} -32)`}><rect x="-6" y="0" width="12" height="10" rx="2" fill="#3b2418" /><path d="M-3 0 q3 -5 6 0" stroke="#3b2418" fill="none" strokeWidth="1.5" /></g>}
        {ex.has("bottle") && <g transform={`translate(${16 * w} -38)`}><rect x="-2.5" y="-6" width="5" height="11" rx="2" fill="#3f6b3a" /><rect x="-1" y="-10" width="2" height="4" fill="#3f6b3a" /></g>}
        {ex.has("lantern") && <g transform={`translate(${17 * w} -30)`}><circle cx="0" cy="4" r="10" fill="#ffcf6b" opacity="0.25" className="flicker" /><rect x="-3.5" y="0" width="7" height="9" rx="1.5" fill="#ffd27a" stroke="#5a4020" strokeWidth="1.2" /><path d="M-2 0 q2 -5 4 0" stroke="#5a4020" fill="none" strokeWidth="1.2" /></g>}
        {ex.has("glass") && <g transform={`translate(${17 * w} -40)`}><circle cx="0" cy="-4" r="4.5" fill="#bfe1ff" fillOpacity="0.35" stroke="#7a5a2a" strokeWidth="1.5" /><path d="M2 0 l3 6" stroke="#7a5a2a" strokeWidth="2" /></g>}
        {/* head */}
        <rect x="-3.5" y="-76" width="7" height="6" fill={shade(look.skin, -0.06)} />
        <circle cx="0" cy="-84" r="12" fill={look.skin} />
        <g className="blink">
          <circle cx="-4.2" cy="-84" r="1.4" fill="#2a1d14" />
          <circle cx="4.2" cy="-84" r="1.4" fill="#2a1d14" />
        </g>
        <circle cx="-7" cy="-79.5" r="2.2" fill="#e8907a" opacity="0.35" />
        <circle cx="7" cy="-79.5" r="2.2" fill="#e8907a" opacity="0.35" />
        {talking ? (
          <ellipse className="talk" cx="0" cy="-78" rx="2.4" ry="1.6" fill="#5a2a22" />
        ) : (
          <path d="M-2.5 -78.5 Q0 -77 2.5 -78.5" stroke="#5a2a22" strokeWidth="1.1" fill="none" />
        )}
        {ex.has("spectacles") && <g stroke="#2a2a2a" strokeWidth="0.9" fill="#cfe6ff" fillOpacity="0.25"><circle cx="-4.2" cy="-84" r="3" /><circle cx="4.2" cy="-84" r="3" /><path d="M-1.2 -84 h2.4" /></g>}
        {ex.has("beard") && <path d="M-10 -82 Q-10 -68 0 -66 Q10 -68 10 -82 Q6 -76 0 -76 Q-6 -76 -10 -82 Z" fill={look.hair} />}
        {ex.has("mustache") && <path d="M-5 -79.5 Q0 -82 5 -79.5 Q2 -78 0 -79 Q-2 -78 -5 -79.5 Z" fill={look.hair} />}
        <HairFront look={look} />
        <HatShape look={look} />
      </g>
    </g>
  );
}

/** A head-and-shoulders portrait of a figure, for the dialogue box and cards. */
export function Portrait({ who, size = 120, talking = false, mood }: { who: string; size?: number; talking?: boolean; mood?: string }) {
  const look = LOOKS[who] ?? LOOKS.player;
  const s = look.scale ?? 1;
  return (
    <svg viewBox={`-30 ${-118 * s} 60 ${66 * s}`} width={size} height={size} className="overflow-visible">
      <defs>
        <radialGradient id={`pbg-${who}`} cx="50%" cy="40%">
          <stop offset="0%" stopColor={mood === "guarded" ? "#5a3a3a" : "#5a4a34"} />
          <stop offset="100%" stopColor="#1c1714" />
        </radialGradient>
      </defs>
      <clipPath id={`pclip-${who}-${size}`}><circle cx="0" cy={-85 * s} r="29" /></clipPath>
      <circle cx="0" cy={-85 * s} r="29" fill={`url(#pbg-${who})`} />
      <g clipPath={`url(#pclip-${who}-${size})`}><Figure look={look} talking={talking} /></g>
    </svg>
  );
}

export const NAMES: Record<string, string> = {
  player: "You",
  inspector: "Inspector Graves",
};
