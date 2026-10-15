// The cast, as LPC pixel-art sprites (built by scripts/build_sprites.py; credits in
// public/sprites/CREDITS.md). Each sheet is a walk cycle: 9 frames x 4 directions, 64px frames,
// frame 0 standing. In the world a sprite's origin is at its feet; the same sheet gives the
// dialogue portrait, cropped to the head.

import { useEffect, useState } from "react";
import BOUNDS from "./sprites.json";

export type Dir = "up" | "left" | "down" | "right";
export type Mood = "neutral" | "angry" | "worried" | "guarded" | "happy";

/** Every character with a sprite sheet, with where its head and feet sit in the standing frame. */
export const SPRITES: Record<string, { top: number; bottom: number }> = BOUNDS;

const ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };
const PX = 1.25; // world units per sprite pixel, the same as the village map: an adult stands about 60 units tall
const sheet = (who: string) => `${import.meta.env.BASE_URL}sprites/${who}.png`;
const known = (who: string) => (SPRITES[who] ? who : "player");

/** Frames 1-8 of the walk cycle while walking, frame 0 when standing. */
function useWalkFrame(walking: boolean) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!walking) {
      setFrame(0);
      return;
    }
    const t = window.setInterval(() => setFrame((f) => (f % 8) + 1), 80);
    return () => window.clearInterval(t);
  }, [walking]);
  return frame;
}

/** Where the face is, in sprite pixels from the top of the frame (children stand lower). */
const faceOf = (who: string) => (SPRITES[who].top > 18 ? SPRITES[who].top + 8 : 24);

function MoodMark({ mood, y }: { mood: Mood; y: number }) {
  if (mood === "worried") return <path className="sweat" transform={`translate(11 ${y - 10})`} d="M0 0 q2 4 0 5 q-2 -1 0 -5 Z" fill="#9fd0f0" stroke="#3a5a7a" strokeWidth="0.8" />;
  if (mood === "angry") return <path transform={`translate(9 ${y - 16})`} d="M0 4 l3.5 -3.5 M3.5 6 l5 -1.5 M1.5 0.5 l0.7 -5" stroke="#e0452d" strokeWidth="1.8" strokeLinecap="round" />;
  if (mood === "happy") return <path transform={`translate(11 ${y - 14})`} d="M0 0 l1.4 -3.5 l1.4 3.5 l3.5 0.7 l-3.5 1.4 l-1.4 3.5 l-1.4 -3.5 l-3.5 -1.4 Z" fill="#ffe28a" />;
  return null;
}

export function Sprite({ who, dir = "down", walking = false, talking = false, mood = "neutral" }: {
  who: string;
  dir?: Dir;
  walking?: boolean;
  talking?: boolean;
  mood?: Mood;
}) {
  const id = known(who);
  const frame = useWalkFrame(walking);
  const { bottom } = SPRITES[id];
  return (
    <g className={`sprite ${talking ? "talking" : ""}`}>
      <ellipse cx="0" cy="0" rx="10" ry="3.2" fill="#000" opacity="0.3" />
      <g className={walking ? "" : "breathe"}>
        <svg x={-32 * PX} y={-bottom * PX} width={64 * PX} height={64 * PX} viewBox={`${frame * 64} ${ROW[dir] * 64} 64 64`}>
          <image href={sheet(id)} width="576" height="256" style={{ imageRendering: "pixelated" }} />
        </svg>
      </g>
      <MoodMark mood={mood} y={-(bottom - faceOf(id)) * PX} />
    </g>
  );
}

/** A head-and-shoulders portrait cut from the front-facing standing frame. */
export function Portrait({ who, size = 120, talking = false, mood }: { who: string; size?: number; talking?: boolean; mood?: Mood }) {
  const id = known(who);
  const top = SPRITES[id].top > 18 ? SPRITES[id].top - 6 : 7;
  const clip = `pclip-${id}-${size}`;
  return (
    <svg viewBox="0 0 34 34" width={size} height={size} className="overflow-visible">
      <defs>
        <radialGradient id={`pbg-${id}-${mood ?? "n"}`} cx="50%" cy="40%">
          <stop offset="0%" stopColor={mood === "angry" ? "#6a2a22" : mood === "guarded" || mood === "worried" ? "#4a3a4a" : "#5a4a34"} />
          <stop offset="100%" stopColor="#1c1714" />
        </radialGradient>
        <clipPath id={clip}><circle cx="17" cy="17" r="17" /></clipPath>
      </defs>
      <circle cx="17" cy="17" r="17" fill={`url(#pbg-${id}-${mood ?? "n"})`} />
      <g clipPath={`url(#${clip})`}>
        <g className={talking ? "talk-bob" : ""}>
          <svg x="0" y="0" width="34" height="34" viewBox={`15 ${128 + top} 34 34`}>
            <image href={sheet(id)} width="576" height="256" style={{ imageRendering: "pixelated" }} />
          </svg>
        </g>
      </g>
    </svg>
  );
}

export const NAMES: Record<string, string> = {
  player: "You",
  inspector: "Inspector Graves",
};
