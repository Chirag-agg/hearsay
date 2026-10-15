// Village life that has nothing to do with the case: travellers walking the roads and stepping into
// houses, a horse pulling a hay cart, a rowboat drifting down the river and another at its mooring,
// cows and sheep grazing, chickens, butterflies, chimney smoke and the river's shimmer.
// One animation loop moves everything by writing SVG attributes directly, so React doesn't
// re-render every frame. Sprites come from scripts/build_sprites.py and scripts/build_life.py.

import { useEffect, useMemo, useRef } from "react";
import LIFE from "./life.json";
import VILLAGE from "./village.json";
import { PLACES } from "./world";

type P = { x: number; y: number };
type Dir = "up" | "left" | "down" | "right";

const PX = VILLAGE.map.scale; // world units per sprite pixel
const ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");

/** The road between two places, the same curve build_village.py draws (always computed in its drawn direction). */
function road(a: string, b: string): P[] {
  const drawn = VILLAGE.roads.some(([x, y]) => x === a && y === b);
  const [s, t] = drawn ? [a, b] : [b, a];
  // The square's well stands where the roads meet: passers-by stop just south of it.
  const end = (id: string) => (id === "square" ? { x: PLACES[id].x + 6, y: PLACES[id].y + 52 } : PLACES[id]);
  const p = end(s);
  const q = end(t);
  const off = 12.5;
  const c = { x: (p.x + q.x) / 2 + (q.y - p.y) * 0.12, y: (p.y + q.y) / 2 - (q.x - p.x) * 0.06 + off };
  const pts: P[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    pts.push({
      x: (1 - u) ** 2 * p.x + 2 * (1 - u) * u * c.x + u * u * q.x,
      y: (1 - u) ** 2 * (p.y + off) + 2 * (1 - u) * u * c.y + u * u * (q.y + off),
    });
  }
  return drawn ? pts : pts.reverse();
}

type Stop = { at: number; place: string };
function route(places: string[]): { path: P[]; stops: Stop[] } {
  const path: P[] = [];
  const stops: Stop[] = [{ at: 0, place: places[0] }];
  for (let i = 0; i + 1 < places.length; i++) {
    const seg = road(places[i], places[i + 1]);
    path.push(...(i === 0 ? seg : seg.slice(1)));
    stops.push({ at: path.length - 1, place: places[i + 1] });
  }
  return { path, stops };
}

/** Walks a path back and forth, pausing at the places on it. */
class Follower {
  path: P[];
  stops: Map<number, string>;
  i = 0;
  pos: P;
  dir: Dir = "down";
  wait = 0;
  waited = 0;
  clock = 0;
  constructor(places: string[], public speed: number, start = 0) {
    const r = route(places);
    this.path = r.path;
    this.stops = new Map(r.stops.map((s) => [s.at, s.place]));
    this.i = Math.min(start, this.path.length - 2);
    this.pos = { ...this.path[this.i] };
  }
  get walking() {
    return this.wait <= 0;
  }
  step(dt: number, pause: () => number) {
    if (this.wait > 0) {
      this.wait -= dt;
      this.waited += dt;
      return;
    }
    let left = this.speed * dt;
    while (left > 0) {
      const to = this.path[this.i + 1];
      const dx = to.x - this.pos.x;
      const dy = to.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) this.dir = dirOf(dx, dy);
      if (d > left) {
        this.pos.x += (dx / d) * left;
        this.pos.y += (dy / d) * left;
        break;
      }
      this.pos = { ...to };
      left -= d;
      this.i++;
      const end = this.i >= this.path.length - 1;
      if (end) {
        this.path.reverse();
        this.stops = new Map([...this.stops].map(([k, v]) => [this.path.length - 1 - k, v]));
        this.i = 0;
      }
      if (end || this.stops.has(this.i)) {
        this.wait = pause();
        this.waited = 0;
        this.dir = "down";
        break;
      }
    }
    this.clock += dt;
  }
  place() {
    return this.stops.get(this.i);
  }
}

/** A sprite sheet frame shown at the map's pixel scale, its feet at the group's origin. */
function Frame({ href, frame, feet, cols, rows, gRef, sRef, scale = 1, shadow = 0 }: {
  href: string; frame: number; feet: number; cols: number; rows: number;
  gRef: (el: SVGGElement | null) => void; sRef: (el: SVGSVGElement | null) => void; scale?: number; shadow?: number;
}) {
  const w = frame * PX * scale;
  return (
    <g ref={gRef}>
      {shadow > 0 && <ellipse cx="0" cy="0" rx={shadow} ry={shadow * 0.32} fill="#000" opacity="0.28" />}
      <svg ref={sRef} x={-w / 2} y={-feet * PX * scale} width={w} height={w} viewBox={`0 0 ${frame} ${frame}`}>
        <image href={asset(href)} width={frame * cols} height={frame * rows} style={{ imageRendering: "pixelated" }} />
      </svg>
    </g>
  );
}

const TRAVELLERS: { who: string; places: string[]; speed: number; night?: boolean }[] = [
  { who: "farmer", places: ["mill", "riverside", "chapel", "square", "smithy"], speed: 34 },
  { who: "maid", places: ["tavern", "square", "herbalist"], speed: 30 },
  { who: "merchant", places: ["manor", "square", "tavern"], speed: 26 },
  { who: "pilgrim", places: ["chapel", "herbalist", "square", "manor"], speed: 22, night: true },
  { who: "washer", places: ["herbalist", "chapel", "riverside"], speed: 30 },
  { who: "watchman", places: ["smithy", "square", "chapel", "riverside", "mill"], speed: 32, night: true },
];
const INDOORS = new Set(["tavern", "smithy", "manor", "herbalist", "chapel", "mill"]);

type Grazer = { kind: "cow" | "sheep" | "chicken"; pos: P; to: P; eat: number; clock: number; dir: Dir; box: number[]; speed: number };

export default function Life({ night = false }: { night?: boolean }) {
  const refs = useRef<Record<string, SVGElement | null>>({});
  const set = (key: string) => (el: SVGElement | null) => { refs.current[key] = el; };

  const travellers = useMemo(() => TRAVELLERS.filter((t) => !night || t.night)
    .map((t, k) => ({ ...t, f: new Follower(t.places, t.speed, (k * 37) % 40) })), [night]);
  const cart = useMemo(() => new Follower(["mill", "riverside", "chapel", "square", "tavern"], 30, 10), []);
  const grazers = useMemo<Grazer[]>(() => {
    const out: Grazer[] = [];
    const add = (kind: Grazer["kind"], box: number[], n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const pos = { x: rand(box[0], box[2]), y: rand(box[1], box[3]) };
        out.push({ kind, pos, to: { ...pos }, eat: rand(0, 4), clock: rand(0, 3), dir: "down", box, speed });
      }
    };
    add("cow", VILLAGE.pasture, 2, 9);
    add("sheep", VILLAGE.pasture, 3, 11);
    add("chicken", VILLAGE.yard, 4, 22);
    return out;
  }, []);
  const river = VILLAGE.river;
  const riverLen = useMemo(() => river.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - river[i].x, p.y - river[i].y), 0), [river]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let boatS = rand(0, riverLen * 0.5);
    const at = (s: number) => {
      let left = s;
      for (let i = 0; i + 1 < river.length; i++) {
        const a = river[i];
        const b = river[i + 1];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (left <= d) return { x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
        left -= d;
      }
      const a = river[river.length - 2];
      const b = river[river.length - 1];
      return { ...b, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    };
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const r = refs.current;
      const t = now / 1000;
      const frame = (key: string, size: number, col: number, row: number) =>
        r[key]?.setAttribute("viewBox", `${col * size} ${row * size} ${size} ${size}`);
      const place = (key: string, p: P, extra = "") => r[key]?.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})${extra}`);

      travellers.forEach((tr, k) => {
        const f = tr.f;
        f.step(dt, () => (INDOORS.has(f.place() ?? "") ? rand(4, 9) : rand(2, 4)));
        const inside = !f.walking && INDOORS.has(f.place() ?? "");
        const opacity = inside ? Math.max(0, Math.min(1, Math.max(1 - f.waited / 0.5, 1 - f.wait / 0.5))) : 1;
        place(`t${k}`, f.pos);
        r[`t${k}`]?.setAttribute("opacity", opacity.toFixed(2));
        frame(`t${k}s`, 64, f.walking ? 1 + (Math.floor(f.clock * 9) % 8) : 0, ROW[f.dir]);
      });

      cart.step(dt, () => rand(4, 8));
      const d = cart.dir;
      const back = { right: { x: -74, y: -2 }, left: { x: 74, y: -2 }, down: { x: 0, y: -46 }, up: { x: 0, y: 44 } }[d];
      place("horse", cart.pos);
      frame("horses", 128, cart.walking ? Math.floor(cart.clock * 6.6) % 4 : 0, ROW[d]);
      for (const slot of ["cartBack", "cartFront"]) {
        const shown = (slot === "cartFront") === (d === "up");
        r[slot]?.setAttribute("display", shown ? "inline" : "none");
        place(slot, { x: cart.pos.x + back.x, y: cart.pos.y + back.y });
        frame(`${slot}s`, 64, ROW[d], 0);
      }

      grazers.forEach((g, k) => {
        g.clock += dt;
        const dx = g.to.x - g.pos.x;
        const dy = g.to.y - g.pos.y;
        const dist = Math.hypot(dx, dy);
        const size = g.kind === "chicken" ? 32 : 128;
        if (night && g.kind !== "chicken") {
          frame(`g${k}s`, size, 0, 4 + ROW[g.dir]);
        } else if (g.eat > 0) {
          g.eat -= dt;
          const n = Math.floor(g.clock * 5);
          frame(`g${k}s`, size, g.kind === "chicken" ? n % 4 : n < 2 ? n : 2 + (n % 2), 4 + ROW[g.dir]);
          if (g.eat <= 0) {
            g.to = { x: rand(g.box[0], g.box[2]), y: rand(g.box[1], g.box[3]) };
            g.clock = 0;
          }
        } else if (dist < 1) {
          g.eat = g.kind === "chicken" ? rand(1, 3) : rand(4, 9);
          g.clock = 0;
        } else {
          const s = Math.min(dist, g.speed * dt);
          g.pos.x += (dx / dist) * s;
          g.pos.y += (dy / dist) * s;
          g.dir = dirOf(dx, dy);
          frame(`g${k}s`, size, Math.floor(g.clock * 6) % 4, ROW[g.dir]);
        }
        place(`g${k}`, g.pos);
      });

      boatS += dt * 12;
      if (boatS > riverLen + 60) boatS = -60;
      const b = at(Math.max(0, Math.min(riverLen, boatS)));
      const fade = Math.max(0, Math.min(1, boatS / 60, (riverLen - boatS) / 60));
      place("boat", { x: b.x, y: b.y + Math.sin(t * 1.6) * 1.2 }, ` rotate(${b.angle.toFixed(1)})`);
      r.boat?.setAttribute("opacity", fade.toFixed(2));
      // Tied up by the riverside path, against the bank nearest to it.
      const m = river[4];
      place("moored", { x: m.x - 26, y: m.y - 18 + Math.sin(t * 1.2) * 1 }, ` rotate(${(-38 + Math.sin(t * 0.8) * 3).toFixed(1)})`);

      [0, 1, 2].forEach((k) => {
        const c = [{ x: 120, y: 760 }, { x: 1080, y: 520 }, { x: 110, y: 580 }][k];
        place(`fly${k}`, { x: c.x + Math.sin(t * (0.7 + k * 0.2) + k) * 60, y: c.y + Math.sin(t * (1.3 + k * 0.1) + k * 2) * 30 });
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [travellers, cart, grazers, river, riverLen, night]);

  const boatW = LIFE.boat.width * PX * 0.75;
  const boatH = LIFE.boat.height * PX * 0.75;
  const riverPath = river.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  return (
    <g pointerEvents="none">
      {/* the river's shimmer */}
      {[-22, 6, 28].map((dx, i) => (
        <path key={i} d={riverPath} transform={`translate(${dx} ${i * 4})`} stroke="#e8f6ff" strokeOpacity={night ? 0.12 : 0.28}
          strokeWidth="2" fill="none" strokeDasharray={`${8 + i * 4} ${30 + i * 9}`} className="flow" style={{ animationDuration: `${7 + i * 2}s` }} />
      ))}
      {VILLAGE.chimneys.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`} fill={night ? "#8a8fa0" : "#e8e4dc"} opacity="0.75">
          {[0, 1, 2].map((k) => <circle key={k} className="smoke" style={{ animationDelay: `${k * 1.3 + i * 0.4}s` }} cx="0" cy="0" r={5 + k * 1.5} />)}
        </g>
      ))}
      <g ref={set("moored")}>
        <image href={asset("life/boat.png")} x={-boatW / 2} y={-boatH / 2} width={boatW} height={boatH} style={{ imageRendering: "pixelated" }} />
      </g>
      <g ref={set("boat")}>
        <image href={asset("life/boat.png")} x={-boatW / 2} y={-boatH / 2} width={boatW} height={boatH} style={{ imageRendering: "pixelated" }} />
      </g>
      {grazers.map((g, k) => {
        const m = LIFE[g.kind];
        return <Frame key={k} href={`life/${g.kind}.png`} frame={m.frame} feet={m.feet} cols={4} rows={8} gRef={set(`g${k}`)} sRef={set(`g${k}s`)} />;
      })}
      <Frame href="life/cart.png" frame={64} feet={LIFE.cart.feet} cols={4} rows={1} gRef={set("cartBack")} sRef={set("cartBacks")} />
      <Frame href="life/horse.png" frame={128} feet={LIFE.horse.feet - 8} cols={4} rows={4} gRef={set("horse")} sRef={set("horses")} />
      <Frame href="life/cart.png" frame={64} feet={LIFE.cart.feet} cols={4} rows={1} gRef={set("cartFront")} sRef={set("cartFronts")} />
      {travellers.map((tr, k) => (
        <g key={tr.who}>
          <Frame href={`sprites/${tr.who}.png`} frame={64} feet={62} cols={9} rows={4} shadow={10} gRef={set(`t${k}`)} sRef={set(`t${k}s`)} />
        </g>
      ))}
      {!night && [0, 1, 2].map((k) => (
        <g key={k} ref={set(`fly${k}`)}>
          <g className="wing" fill={["#f3eee2", "#e8c24a", "#d98aa0"][k]}>
            <ellipse cx="-2.2" cy="0" rx="2.4" ry="3" />
            <ellipse cx="2.2" cy="0" rx="2.4" ry="3" />
          </g>
        </g>
      ))}
    </g>
  );
}
