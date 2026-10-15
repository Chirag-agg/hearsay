// The reveal as a night-time flashback: the truth graph's timeline played out in the village,
// then the scene sighting passing from mouth to mouth and changing on the way.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { api, type Reveal } from "../api";
import Scene, { type WalkerSpec } from "./Scene";
import { PLACES, STANDS, skyAt } from "./world";

type Beat = { time: string; text: string; walkers: WalkerSpec[] };

const at = (place: string, dx = 0, dy = 0) => ({ x: PLACES[place].x + dx, y: PLACES[place].y + dy + 24 });

function beats(): Beat[] {
  return [
    { time: "17:30", text: "Elena collects repaired tools from the Smithy and slips the hammer into a cloth bundle while Jonas works out back. Tilly sees the bundle.",
      walkers: [{ id: "elena", look: "elena", at: at("smithy", -40) }, { id: "jonas", look: "jonas", at: at("smithy", 110, -10) },
        { id: "tilly", look: "tilly", at: at("smithy", -120, 30) }] },
    { time: "18:00", text: "In the square, Silas tells Elena to pay her 300 crowns by Friday or lose her shop. Tilly overhears.",
      walkers: [{ id: "elena", look: "elena", at: at("square", -40) }, { id: "silas", look: "silas", at: at("square", 30) },
        { id: "tilly", look: "tilly", at: at("square", -150, 20) }, { id: "jonas", look: "jonas", at: at("smithy", 60) }] },
    { time: "20:00", text: "At the Tavern, Jonas argues loudly with Silas about the 40 crowns he owes. Bess, Hale and Imogen all hear it.",
      walkers: [{ id: "silas", look: "silas", at: at("tavern", 50) }, { id: "jonas", look: "jonas", at: at("tavern", -10) },
        { id: "bess", look: "bess", at: at("tavern", 120, 10) }, { id: "hale", look: "hale", at: at("tavern", -110, 20) },
        { id: "imogen", look: "imogen", at: at("tavern", -170, 0) }, { id: "elena", look: "elena", at: at("chapel", -40) },
        { id: "aldric", look: "aldric", at: at("chapel", 50) }] },
    { time: "20:30", text: "Silas leaves for the Mill, where Elena has offered to “settle up”.",
      walkers: [{ id: "silas", look: "silas", at: at("mill", -60), speed: 260 }, { id: "jonas", look: "jonas", at: at("tavern", -10) },
        { id: "bess", look: "bess", at: at("tavern", 120, 10) }, { id: "elena", look: "elena", at: at("chapel", -40) },
        { id: "aldric", look: "aldric", at: at("chapel", 50) }] },
    { time: "21:00", text: "Elena leaves evening prayer early; Father Aldric sees her go. Jonas slips out of the Tavern toward the Manor and Lady Wren.",
      walkers: [{ id: "elena", look: "elenaNight", at: at("riverside", -60) }, { id: "aldric", look: "aldric", at: at("chapel", 50) },
        { id: "jonas", look: "jonas", at: at("manor", -60), speed: 240 }, { id: "wren", look: "wren", at: at("manor", 20) },
        { id: "silas", look: "silas", at: at("mill", -60) }] },
    { time: "21:30", text: "On the Riverside path, Pip, walking home, sees a woman with a lantern heading for the Mill. At the Mill, Elena kills Silas with the hammer.",
      walkers: [{ id: "elena", look: "elenaNight", at: at("mill", -60), speed: 80 }, { id: "pip", look: "pip", at: { x: STANDS.pip.x, y: STANDS.pip.y } },
        { id: "silas", look: "silas", at: at("mill", -40) }, { id: "jonas", look: "jonas", at: at("manor", -60) },
        { id: "wren", look: "wren", at: at("manor", 20) }] },
    { time: "22:00", text: "Elena is back at her shop. Later she hides the hammer under her floorboards. At 06:00, Brann finds the body.",
      walkers: [{ id: "elena", look: "elena", at: at("herbalist", 50), speed: 300 }, { id: "brann", look: "brann", at: at("mill", -100) }] },
  ];
}

export default function Flashback({ g, onDone }: { g: string; onDone: () => void }) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [i, setI] = useState(0);
  const story = useMemo(beats, []);
  useEffect(() => {
    api.reveal(g).then(setReveal).catch(() => undefined);
  }, [g]);
  const onStory = i < story.length;
  const beat = story[Math.min(i, story.length - 1)];
  const rumor = (reveal?.sighting_rumor ?? []).slice(0, 3);
  const rumorStep = i - story.length; // 0..rumor.length-1 then the summary

  const RUMOR_CHAIN = ["pip", "hale", "brann", "bess"];
  const rumorWalkers: WalkerSpec[] = RUMOR_CHAIN.map((id, k) => ({
    id, look: id, at: { x: 330 + k * 300, y: 540 }, label: ["Pip", "Hale", "Brann", "Bess"][k],
  }));
  const rumorBubble = rumorStep >= 0 && rumorStep < rumor.length
    ? [{ id: `hop${rumorStep}`, from: { x: 330 + rumorStep * 300, y: 540 }, to: { x: 330 + (rumorStep + 1) * 300, y: 540 }, delay: 0.2 }]
    : [];

  return (
    <div className="absolute inset-0 z-50 bg-black">
      <div className="absolute inset-0">
        <Scene sky={skyAt(0, true)} villagers={[]} bubbles={onStory ? [] : rumorBubble} interactive={false} life={false}
          walkers={onStory ? beat.walkers : rumorWalkers}
          extras={onStory && i === 5 ? <circle cx={PLACES.riverside.x - 40} cy={PLACES.riverside.y - 20} r="160" fill="#ffd27a" opacity="0.08" /> : null} />
      </div>
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
      <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <div className="font-display text-sm uppercase tracking-[0.4em] text-[#cbb89a]">What really happened</div>
        {reveal && <div className="font-display text-3xl text-[#f8eed6]">{reveal.truth.killer} killed {reveal.truth.victim}</div>}
      </div>

      <AnimatePresence>
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className="parchment absolute inset-x-3 bottom-4 mx-auto max-w-3xl p-5">
          {onStory ? (
            <>
              <div className="font-mono text-2xl text-[#9a2f1f]">{beat.time}</div>
              <p className="mt-1 font-display text-xl leading-snug">{beat.text}</p>
            </>
          ) : rumorStep < rumor.length ? (
            <>
              <div className="font-display text-sm uppercase tracking-widest text-[#6b5040]">How the sighting changed, hop by hop</div>
              <p className="mt-1 font-display text-xl">
                {rumor[rumorStep].from} told {rumor[rumorStep].to}… and the{" "}
                {rumor[rumorStep].changed === "t" ? "time" : rumor[rumorStep].changed === "subject" ? "person" : "place"} changed:{" "}
                <s className="text-[#6b5040]">{rumor[rumorStep].before}</s> → <b className="text-[#9a2f1f]">{rumor[rumorStep].after}</b>
              </p>
            </>
          ) : (
            <>
              <div className="font-display text-sm uppercase tracking-widest text-[#6b5040]">The village believed a rumor. The graph remembered who said it first.</div>
              <ul className="mt-2 space-y-1 text-[14px]">
                {reveal?.lies_caught.map((l, k) => <li key={k}>✗ {l.detail}{l.liar ? <b className="text-[#9a2f1f]"> · {l.liar}</b> : null}</li>)}
                {reveal?.killer_reacted?.map((r, k) => <li key={`r${k}`}>⚑ {r.villager} {r.what}.</li>)}
                {reveal && <li className="text-[#6b5040]">{reveal.gossip.hops} retellings in all; {reveal.gossip.mutated} changed a detail on the way.</li>}
              </ul>
            </>
          )}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[12px] text-[#6b5040]">{Math.min(i + 1, story.length + rumor.length + 1)} / {story.length + rumor.length + 1}</span>
            {i > 0 && <button className="wood ml-auto" onClick={() => setI(i - 1)}>Back</button>}
            {i < story.length + rumor.length ? (
              <button className={`wood ${i > 0 ? "" : "ml-auto"}`} onClick={() => setI(i + 1)}>Next</button>
            ) : (
              <button className="wood" onClick={onDone}>Back to the village</button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
