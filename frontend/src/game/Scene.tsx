// The living village: the drawn world, villagers at their places, the player and the inspector
// walking between them, gossip flying as speech bubbles, and a camera you can drag and zoom
// that follows the player and swoops in on conversations.

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { sound } from "./audio";
import Life from "./life";
import { Sprite, type Dir, type Mood } from "./characters";
import { H, Lighting, PLACES, W, Windmill, World, type Sky } from "./world";

export type Point = { x: number; y: number };
export type Bubble = { id: string; from: Point; to: Point; delay: number };
export type Camera = { x: number; y: number; w: number };

export type Actor = {
  id: string;
  name: string;
  at: Point;
  dir?: Dir; // which way they face (front by default)
  talking?: boolean;
  thinking?: boolean;
  dim?: boolean;
  marker?: boolean; // gold "!": someone you should talk to
  emote?: string; // a short-lived emoji over the head
  mood?: Mood;
};

const FULL: Camera = { x: 0, y: 0, w: W };
const MIN_W = 420;

function clamp(c: Camera): Camera {
  const w = Math.max(MIN_W, Math.min(W, c.w));
  const h = (w * H) / W;
  return { w, x: Math.max(0, Math.min(W - w, c.x)), y: Math.max(0, Math.min(H - h, c.y)) };
}

function Walker({ id, to, children, onArrive, speed = 140, steps = false }: {
  id: string;
  to: Point;
  children: (walking: boolean, dir: Dir) => React.ReactNode;
  onArrive?: () => void;
  speed?: number;
  steps?: boolean;
}) {
  const from = useRef<Point>(to);
  const [walking, setWalking] = useState(false);
  const [dir, setDir] = useState<Dir>("down");
  const dx = to.x - from.current.x;
  const dy = to.y - from.current.y;
  const dist = Math.hypot(dx, dy);
  useEffect(() => {
    if (dist >= 1) setDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  }, [to.x, to.y]);
  useEffect(() => {
    if (!walking || !steps) return;
    const t = window.setInterval(() => sound.step(), 230);
    return () => window.clearInterval(t);
  }, [walking, steps]);
  return (
    <motion.g
      key={id}
      initial={false}
      animate={{ x: to.x, y: to.y }}
      transition={{ duration: Math.max(0.01, dist / speed), ease: "linear" }}
      onAnimationStart={() => dist > 1 && setWalking(true)}
      onAnimationComplete={() => {
        from.current = to;
        setWalking(false);
        setDir("down");
        onArrive?.();
      }}
    >
      {children(walking, dir)}
    </motion.g>
  );
}

export type WalkerSpec = { id: string; look: string; at: Point; speed?: number; label?: string };

function Ambient({ night }: { night: boolean }) {
  return (
    <g pointerEvents="none">
      {!night && [0, 1].map((k) => (
        <g key={k} className="flock" style={{ animationDelay: `${k * -17}s`, animationDuration: `${34 + k * 9}s` }}>
          {[[0, 0], [22, 10], [-20, 12], [40, 22]].map(([x, y], i) => (
            <path key={i} className="flap" style={{ animationDelay: `${i * 0.13}s` }}
              d={`M${x - 7} ${y + 60 + k * 50} q7 -6 7 0 q0 -6 7 0`} stroke="#3a3530" strokeWidth="1.8" fill="none" />
          ))}
        </g>
      ))}
      {!night && Array.from({ length: 14 }, (_, i) => (
        <g key={i} className="leaf" style={{ animationDelay: `${(i * -2.7) % 30}s`, animationDuration: `${18 + (i % 5) * 4}s` }}>
          <path transform={`translate(${(i * 131) % W} ${-20 - (i % 4) * 30})`} d="M0 0 q5 -6 10 0 q-5 6 -10 0 Z"
            fill={["#d9822b", "#c2412d", "#e8b23a", "#a8642a"][i % 4]} opacity="0.85" />
        </g>
      ))}
      {night && Array.from({ length: 22 }, (_, i) => (
        <circle key={i} className="firefly" style={{ animationDelay: `${(i * 0.7) % 6}s`, animationDuration: `${5 + (i % 4)}s` }}
          cx={[1240, 1300, 1380, 1180, 1100, 980, 560, 210, 160, 640, 1450, 1520][i % 12] + (i * 37) % 60}
          cy={[760, 700, 820, 840, 800, 610, 820, 720, 380, 660, 700, 520][i % 12] - (i * 23) % 70}
          r="2.2" fill="#ffe98a" />
      ))}
    </g>
  );
}

function Overhead({ v }: { v: Actor }) {
  if (v.thinking) {
    return (
      <g transform="translate(18 -150)">
        <g className="float">
          <circle cx="-14" cy="22" r="3.5" fill="#fff8e6" stroke="#7a5230" strokeWidth="1" />
          <rect x="-24" y="-16" width="48" height="26" rx="13" fill="#fff8e6" stroke="#7a5230" strokeWidth="1.5" />
          {[0, 1, 2].map((i) => <circle key={i} className="dots" style={{ animationDelay: `${i * 0.2}s` }} cx={-10 + i * 10} cy="-3" r="3" fill="#7a5230" />)}
        </g>
      </g>
    );
  }
  if (v.emote) {
    return (
      <g transform="translate(0 -152)">
        <g className="pop">
          <circle r="17" fill="#fff8e6" stroke="#7a5230" strokeWidth="1.5" />
          <text y="7" textAnchor="middle" fontSize="20">{v.emote}</text>
        </g>
      </g>
    );
  }
  if (v.marker) {
    return (
      <g transform="translate(0 -150)">
        <g className="bounce">
          <circle r="15" fill="#e8a33d" stroke="#7a5230" strokeWidth="2" />
          <text y="7.5" textAnchor="middle" fontSize="22" fontWeight="900" fill="#2a1d14" fontFamily="Georgia, serif">!</text>
        </g>
      </g>
    );
  }
  return null;
}

export default function Scene({
  sky, villagers, hub, player, playerDir, inspector, bubbles, minds, onVillager, onArrive, onInspectorArrive, interactive = true, extras,
  walkers, focus, labels = false, life = true,
}: {
  sky: Sky;
  villagers: Actor[];
  hub?: string;
  player?: Point | null;
  playerDir?: Dir; // which way the player faces while standing (towards whoever they're talking to)
  inspector?: Point | null;
  bubbles: Bubble[];
  minds?: Record<string, { beliefs: number; heard: number; mutated: number }> | null;
  onVillager?: (id: string) => void;
  onArrive?: () => void;
  onInspectorArrive?: () => void;
  interactive?: boolean;
  extras?: React.ReactNode;
  walkers?: WalkerSpec[];
  focus?: Point | null; // a conversation: the camera swoops in here
  labels?: boolean; // name plates under everyone
  life?: boolean; // travellers, carts, boats and animals going about their day
}) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = useMemo(() => [...villagers].sort((a, b) => a.at.y - b.at.y), [villagers]);
  const svg = useRef<SVGSVGElement>(null);
  const [free, setFree] = useState<Camera>(FULL);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ px: number; py: number; cam: Camera; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // The camera the player steers. Wheel, drag and keys move it instantly; following the player glides.
  const freeRef = useRef(free);
  const instant = useRef(false);
  const steer = (c: Camera) => {
    instant.current = true;
    freeRef.current = clamp(c);
    setFree(freeRef.current);
  };

  // Follow the player when zoomed in.
  useEffect(() => {
    if (!player || focus) return;
    instant.current = false;
    setFree((c) => {
      const next = c.w < W * 0.95 ? clamp({ ...c, x: player.x - c.w / 2, y: player.y - (c.w * H) / W / 2 - 40 }) : c;
      freeRef.current = next;
      return next;
    });
  }, [player?.x, player?.y, focus]);

  const camera = useMemo(() => {
    if (!focus) return free;
    const w = 560;
    const h = (w * H) / W;
    return clamp({ w, x: focus.x - w / 2, y: focus.y - h * 0.46 });
  }, [focus, free]);

  const scaleOf = (c: Camera) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return { s: 1, ox: 0, oy: 0, r: null };
    const h = (c.w * H) / W;
    const s = Math.max(r.width / c.w, r.height / h);
    return { s, ox: (r.width - c.w * s) / 2, oy: (r.height - h * s) / 2, r };
  };

  /** Zoom by a factor, keeping the world point under (sx, sy) in screen pixels where it is (the centre by default). */
  const zoomBy = (k: number, sx?: number, sy?: number) => {
    const cur = freeRef.current;
    const { s, ox, oy, r } = scaleOf(cur);
    if (!r) return;
    const wx = cur.x + ((sx ?? r.left + r.width / 2) - r.left - ox) / s;
    const wy = cur.y + ((sy ?? r.top + r.height / 2) - r.top - oy) / s;
    const w = Math.max(MIN_W, Math.min(W, cur.w * k));
    const ratio = w / cur.w;
    steer({ w, x: wx - (wx - cur.x) * ratio, y: wy - (wy - cur.y) * ratio });
  };
  const panBy = (dx: number, dy: number) => {
    const cur = freeRef.current;
    const { s } = scaleOf(cur);
    steer({ ...cur, x: cur.x + dx / s, y: cur.y + dy / s });
  };

  // A mouse wheel zooms; a trackpad's two-finger scroll pans and its pinch (ctrl + wheel) zooms.
  const onWheel = (e: React.WheelEvent) => {
    if (!interactive || focus) return;
    const trackpad = e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 40);
    if (e.ctrlKey) zoomBy(Math.exp(e.deltaY * 0.01), e.clientX, e.clientY);
    else if (trackpad) panBy(e.deltaX, e.deltaY);
    else zoomBy(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
  };

  // Keys: + and - zoom, 0 shows the whole village, arrows and WASD look around.
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (focus || el?.closest("input, textarea, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "+" || k === "=") zoomBy(0.8);
      else if (k === "-" || k === "_") zoomBy(1.25);
      else if (k === "0") steer(FULL);
      else if (k === "arrowleft" || k === "a") panBy(-90, 0);
      else if (k === "arrowright" || k === "d") panBy(90, 0);
      else if (k === "arrowup" || k === "w") panBy(0, -90);
      else if (k === "arrowdown" || k === "s") panBy(0, 90);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, focus]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || focus) return;
    drag.current = { px: e.clientX, py: e.clientY, cam: freeRef.current, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    const { s } = scaleOf(d.cam);
    steer({ ...d.cam, x: d.cam.x - dx / s, y: d.cam.y - dy / s });
  };
  const onPointerUp = () => {
    if (drag.current?.moved) {
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 50);
    }
    drag.current = null;
    setDragging(false);
  };

  const viewBox = `${camera.x} ${camera.y} ${camera.w} ${(camera.w * H) / W}`;
  const zoomed = camera.w < W * 0.8;

  const snap = dragging || (instant.current && !focus);
  return (
    <div className="relative h-full w-full">
    {interactive && !focus && (
      <div className="absolute bottom-12 right-3 z-10 flex flex-col overflow-hidden rounded-lg border border-[#5a3a22] bg-[#1c1714]/80 text-[#f3e6c8] shadow-lg">
        <button className="h-8 w-8 text-lg hover:bg-white/10" title="Zoom in (+)" onClick={() => zoomBy(0.75)}>+</button>
        <button className="h-8 w-8 border-y border-[#5a3a22] text-lg hover:bg-white/10" title="Zoom out (-)" onClick={() => zoomBy(1.33)}>−</button>
        <button className="h-8 w-8 text-[13px] hover:bg-white/10" title="Whole village (0)" onClick={() => steer(FULL)}>⤢</button>
      </div>
    )}
    <motion.svg ref={svg} initial={false} animate={{ viewBox }}
      transition={{ duration: snap ? 0 : focus ? 0.9 : 0.6, ease: [0.3, 0.7, 0.2, 1] }}
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full select-none ${interactive && !focus ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      style={{ touchAction: "none" }}
      onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
      <World sky={sky} />
      {life && <Life night={sky.night} />}
      <Windmill />
      <Ambient night={sky.night} />
      {extras}

      {sorted.map((v) => (
        <g key={v.id} data-villager={v.id} transform={`translate(${v.at.x} ${v.at.y})`}
          className={interactive ? "cursor-pointer" : ""}
          opacity={v.dim ? 0.55 : 1}
          onClick={() => interactive && !suppressClick.current && onVillager?.(v.id)}
          onMouseEnter={() => setHover(v.id)}
          onMouseLeave={() => setHover(null)}>
          {/* A gold ring marks the people in the case; passers-by have none. */}
          <ellipse cx="0" cy="1" rx="15" ry="5" fill={hover === v.id && interactive ? "#fff3c4" : "none"} fillOpacity="0.45"
            stroke="#ffd27a" strokeWidth="1.6" strokeOpacity={v.dim ? 0.35 : 0.85} />
          {v.id === hub && (
            <g>
              <ellipse cx="0" cy="0" rx="22" ry="7" fill="#ffd27a" opacity="0.35" className="pulse" />
              {!v.marker && !v.emote && !v.thinking && (
                <g transform="translate(0 -82) scale(0.65)">
                  <g className="float">
                    <rect x="-58" y="-14" width="116" height="22" rx="11" fill="#e8a33d" stroke="#7a5230" strokeWidth="1.5" />
                    <text y="2" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1c1714">hears everything</text>
                  </g>
                </g>
              )}
            </g>
          )}
          <Sprite who={v.id} dir={v.dir} talking={v.talking} mood={v.mood} />
          <g transform="translate(0 9) scale(0.62)"><Overhead v={v} /></g>
          {(labels || zoomed || hover === v.id) && !v.talking && (
            <g transform="translate(0 13)">
              <rect x={-v.name.length * 3.3 - 8} y="-11" width={v.name.length * 6.6 + 16} height="18" rx="9" fill="#1c1714" opacity="0.72" />
              <text y="2.5" textAnchor="middle" fontSize="11" fill="#f3e6c8">{v.name}</text>
            </g>
          )}
          {minds?.[v.id] && (
            <g transform="translate(14 -88) scale(0.65)"><g className="float">
              <circle cx="-22" cy="34" r="4" fill="#f3eee2" opacity="0.9" />
              <circle cx="-14" cy="22" r="6" fill="#f3eee2" opacity="0.9" />
              <ellipse cx="18" cy="-4" rx="48" ry="26" fill="#f3eee2" opacity="0.95" />
              <text x="18" y="-8" textAnchor="middle" fontSize="12" fontWeight="700" fill="#2a1d14">{minds[v.id].beliefs} beliefs</text>
              <text x="18" y="8" textAnchor="middle" fontSize="10.5" fill="#5b8fa8">{minds[v.id].heard} heard · {minds[v.id].mutated} changed</text>
            </g></g>
          )}
        </g>
      ))}

      {walkers?.map((w) => (
        <Walker key={w.id} id={w.id} to={w.at} speed={w.speed ?? 100}>
          {(walking, dir) => (
            <g>
              <Sprite who={w.look} walking={walking} dir={dir} />
              {w.label && (
                <g transform="translate(0 14)">
                  <rect x={-w.label.length * 3.6 - 10} y="-12" width={w.label.length * 7.2 + 20} height="20" rx="10" fill="#0b1026" opacity="0.8" />
                  <text y="2.5" textAnchor="middle" fontSize="12" fill="#f3e6c8">{w.label}</text>
                </g>
              )}
            </g>
          )}
        </Walker>
      ))}

      {inspector && (
        <Walker id="inspector" to={inspector} onArrive={onInspectorArrive} speed={170}>
          {(walking, dir) => (
            <g>
              <Sprite who="inspector" walking={walking} dir={dir} />
              <g transform="translate(0 13)">
                <rect x="-56" y="-11" width="112" height="18" rx="9" fill="#2d5f78" opacity="0.85" />
                <text y="2.5" textAnchor="middle" fontSize="11" fill="#fff">Inspector Graves</text>
              </g>
            </g>
          )}
        </Walker>
      )}
      {player && (
        <Walker id="player" to={player} onArrive={onArrive} steps>
          {(walking, dir) => (
            <g>
              <ellipse cx="0" cy="2" rx="16" ry="5" fill="none" stroke="#ffd27a" strokeWidth="2" opacity="0.7" className="pulse" />
              <Sprite who="player" walking={walking} dir={walking ? dir : playerDir ?? dir} />
            </g>
          )}
        </Walker>
      )}

      {bubbles.map((b) => (
        <motion.g key={b.id}
          initial={{ x: b.from.x, y: b.from.y - 70, opacity: 0, scale: 0.3 }}
          animate={{
            x: [b.from.x, (b.from.x + b.to.x) / 2, b.to.x],
            y: [b.from.y - 70, Math.min(b.from.y, b.to.y) - 130, b.to.y - 70],
            opacity: [0, 1, 1, 0],
            scale: [0.3, 0.7, 0.7, 0.4],
          }}
          transition={{ duration: 2.4, delay: b.delay, ease: "easeInOut", times: [0, 0.5, 1] }}>
          <path d="M-18 -12 h36 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-24 l-8 8 v-8 h-4 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6 Z"
            fill="#fff8e6" stroke="#7a5230" strokeWidth="1.5" />
          <circle cx="-8" cy="0" r="2.2" fill="#7a5230" /><circle cx="0" cy="0" r="2.2" fill="#7a5230" /><circle cx="8" cy="0" r="2.2" fill="#7a5230" />
        </motion.g>
      ))}

      <Lighting sky={sky} />
      {/* vignette */}
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity={sky.night ? 0.55 : 0.28} />
        </radialGradient>
      </defs>
      <rect x={camera.x} y={camera.y} width={camera.w} height={(camera.w * H) / W} fill="url(#vignette)" pointerEvents="none" />
    </motion.svg>
    </div>
  );
}

export function placeOf(id: string): Point {
  return PLACES[id] ?? PLACES.square;
}
