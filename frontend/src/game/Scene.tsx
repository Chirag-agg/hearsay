// The living village: the drawn world, villagers at their places, the player and the inspector
// walking between them, and gossip flying as speech bubbles after every question.

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Figure, LOOKS } from "./characters";
import { H, Lighting, PLACES, W, World, type Sky } from "./world";

export type Point = { x: number; y: number };
export type Bubble = { id: string; from: Point; to: Point; delay: number };

type Actor = {
  id: string;
  name: string;
  at: Point;
  facing?: 1 | -1;
  talking?: boolean;
  dim?: boolean;
};

function Walker({ id, to, children, onArrive, speed = 220 }: {
  id: string;
  to: Point;
  children: (walking: boolean, facing: 1 | -1) => React.ReactNode;
  onArrive?: () => void;
  speed?: number;
}) {
  const from = useRef<Point>(to);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const dist = Math.hypot(to.x - from.current.x, to.y - from.current.y);
  useEffect(() => {
    if (to.x !== from.current.x) setFacing(to.x > from.current.x ? 1 : -1);
  }, [to.x]);
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
        onArrive?.();
      }}
    >
      {children(walking, facing)}
    </motion.g>
  );
}

export type WalkerSpec = { id: string; look: string; at: Point; speed?: number; label?: string };

export default function Scene({
  sky, villagers, hub, player, inspector, bubbles, minds, onVillager, onArrive, onInspectorArrive, interactive = true, extras,
  walkers,
}: {
  sky: Sky;
  villagers: Actor[];
  hub?: string;
  player?: Point | null;
  inspector?: Point | null;
  bubbles: Bubble[];
  minds?: Record<string, { beliefs: number; heard: number; mutated: number }> | null;
  onVillager?: (id: string) => void;
  onArrive?: () => void;
  onInspectorArrive?: () => void;
  interactive?: boolean;
  extras?: React.ReactNode;
  walkers?: WalkerSpec[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = useMemo(() => [...villagers].sort((a, b) => a.at.y - b.at.y), [villagers]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full select-none">
      <World sky={sky} />
      {extras}

      {sorted.map((v) => (
        <g key={v.id} data-villager={v.id} transform={`translate(${v.at.x} ${v.at.y})`}
          className={interactive ? "cursor-pointer" : ""}
          opacity={v.dim ? 0.55 : 1}
          onClick={() => interactive && onVillager?.(v.id)}
          onMouseEnter={() => setHover(v.id)}
          onMouseLeave={() => setHover(null)}>
          {v.id === hub && (
            <g>
              <ellipse cx="0" cy="0" rx="34" ry="10" fill="#ffd27a" opacity="0.35" className="pulse" />
              <g transform="translate(0 -136)">
                <g className="float">
                  <rect x="-58" y="-14" width="116" height="22" rx="11" fill="#e8a33d" stroke="#7a5230" strokeWidth="1.5" />
                  <text y="2" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1c1714">hears everything</text>
                </g>
              </g>
            </g>
          )}
          <g transform="scale(1.15)">
            <Figure look={LOOKS[v.id]} facing={v.facing ?? 1} talking={v.talking} />
          </g>
          {(hover === v.id || v.talking) && v.id !== hub && (
            <g transform="translate(0 -138)">
              <rect x={-v.name.length * 3.6 - 10} y="-14" width={v.name.length * 7.2 + 20} height="22" rx="11" fill="#1c1714" opacity="0.85" />
              <text y="2" textAnchor="middle" fontSize="12.5" fill="#f3e6c8">{v.name}</text>
            </g>
          )}
          {minds?.[v.id] && (
            <g transform="translate(26 -150)"><g className="float">
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
        <Walker key={w.id} id={w.id} to={w.at} speed={w.speed ?? 160}>
          {(walking, facing) => (
            <g>
              <g transform="scale(1.15)"><Figure look={LOOKS[w.look]} walking={walking} facing={facing} /></g>
              {w.label && (
                <g transform="translate(0 -140)">
                  <rect x={-w.label.length * 3.6 - 10} y="-14" width={w.label.length * 7.2 + 20} height="22" rx="11" fill="#0b1026" opacity="0.8" />
                  <text y="2" textAnchor="middle" fontSize="12.5" fill="#f3e6c8">{w.label}</text>
                </g>
              )}
            </g>
          )}
        </Walker>
      ))}

      {inspector && (
        <Walker id="inspector" to={inspector} onArrive={onInspectorArrive} speed={260}>
          {(walking, facing) => (
            <g transform="scale(1.15)"><Figure look={LOOKS.inspector} walking={walking} facing={facing} /></g>
          )}
        </Walker>
      )}
      {player && (
        <Walker id="player" to={player} onArrive={onArrive}>
          {(walking, facing) => (
            <g transform="scale(1.15)"><Figure look={LOOKS.player} walking={walking} facing={facing} /></g>
          )}
        </Walker>
      )}

      {bubbles.map((b) => (
        <motion.g key={b.id}
          initial={{ x: b.from.x, y: b.from.y - 110, opacity: 0, scale: 0.4 }}
          animate={{
            x: [b.from.x, (b.from.x + b.to.x) / 2, b.to.x],
            y: [b.from.y - 110, Math.min(b.from.y, b.to.y) - 200, b.to.y - 110],
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1, 0.6],
          }}
          transition={{ duration: 2.4, delay: b.delay, ease: "easeInOut", times: [0, 0.5, 1] }}>
          <path d="M-18 -12 h36 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-24 l-8 8 v-8 h-4 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6 Z"
            fill="#fff8e6" stroke="#7a5230" strokeWidth="1.5" />
          <circle cx="-8" cy="0" r="2.2" fill="#7a5230" /><circle cx="0" cy="0" r="2.2" fill="#7a5230" /><circle cx="8" cy="0" r="2.2" fill="#7a5230" />
        </motion.g>
      ))}

      <Lighting sky={sky} />
    </svg>
  );
}

export function placeOf(id: string): Point {
  return PLACES[id] ?? PLACES.square;
}
