// Objectives and milestones: what to do next (with a gold "!" over whoever to see), and banners
// when the investigation reaches a turning point. All derived from what the villagers have said.

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { Answer } from "../api";

export type Milestone = { id: string; icon: string; title: string; text: string };

export const MILESTONES: Record<string, Milestone> = {
  ear: { id: "ear", icon: "👂", title: "The village ear", text: "You spoke to the one who hears everything." },
  told: { id: "told", icon: "🗣", title: "Who told you?", text: "You asked where a rumor came from." },
  source: { id: "source", icon: "🔦", title: "Back to the source", text: "You traced a rumor to the one who saw it." },
  lie: { id: "lie", icon: "✗", title: "Two stories", text: "You caught a contradiction." },
  motive: { id: "motive", icon: "💰", title: "Follow the money", text: "You found someone with a reason." },
  means: { id: "means", icon: "🔨", title: "The missing hammer", text: "You found out who was at the Smithy." },
  secret: { id: "secret", icon: "🌹", title: "A lady's secret", text: "Lady Wren told you the truth." },
  closed: { id: "closed", icon: "⚖", title: "Case closed", text: "You named the killer." },
};

export type Objective = { title: string; detail: string; targets: string[]; step: number };

/** Milestones this answer unlocks. */
export function milestonesFor(a: Answer, ctx: { hub?: string; followed: boolean }): string[] {
  const ids: string[] = [];
  if (a.villager === ctx.hub) ids.push("ear");
  if (ctx.followed && a.claims.some((c) => c.reported_as === "saw")) ids.push("source");
  if (a.contradictions_new.length) ids.push("lie");
  if (a.claims.some((c) => c.pred === "OWES" || c.pred === "THREATENED")) ids.push("motive");
  if (a.claims.some((c) => c.place === "Smithy" && c.t_to < 1290 && c.reported_as === "saw")) ids.push("means");
  if (a.villager === "wren" && a.claims.some((c) => c.about === "Jonas Reed" && c.place === "Manor")) ids.push("secret");
  return ids;
}

export function objective(answers: Answer[], unlocked: Set<string>, hub: string | undefined, names: Record<string, string>,
  pendingSource: { id: string; name: string } | null): Objective {
  const asked = new Set(answers.map((a) => a.villager));
  const first = (id: string) => (names[id] ?? id).replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0];
  const sightingHeard = answers.some((a) => a.claims.some((c) => c.reported_as === "heard" && /lantern/.test(c.about ?? "")));
  if (!answers.length && hub) {
    return { step: 1, title: `Talk to ${names[hub]}`, detail: "PageRank over who-knows-whom says she hears everything. Start at the Tavern.", targets: [hub] };
  }
  if (pendingSource) {
    return { step: 2, title: `Ask ${pendingSource.name} where they heard it`, detail: "Every hop of a rumor can change it. Follow it back.", targets: [pendingSource.id] };
  }
  if (sightingHeard && !unlocked.has("source") && hub) {
    return { step: 2, title: "Trace the sighting near the Mill", detail: `${first(hub)} heard about a figure with a lantern. Ask her: “Who told you?”`, targets: [hub] };
  }
  if (!unlocked.has("lie")) {
    const who = ["aldric", "elena", "jonas"].filter((v) => !asked.has(v));
    return { step: 3, title: "Check the alibis", detail: "Ask Father Aldric when Elena left the Chapel, and ask Elena and Jonas where they were from 21:00 to 22:00.", targets: who.length ? who : ["aldric"] };
  }
  if (!unlocked.has("motive") || !unlocked.has("means")) {
    return { step: 4, title: "Motive and means", detail: "Who owed Silas money? Who was at the Smithy, where the hammer went missing? Children notice things.", targets: ["tilly"] };
  }
  if (!unlocked.has("secret") && answers.some((a) => a.villager === "jonas")) {
    return { step: 5, title: "Where was Jonas really?", detail: "Ask Lady Wren. Show her what Bess saw: Jonas leaving the Tavern toward the Manor.", targets: ["wren"] };
  }
  return { step: 6, title: "Make your accusation", detail: "Check the notebook's suspects, then name the killer with your evidence.", targets: [] };
}

export function QuestTracker({ obj, count }: { obj: Objective; count: number }) {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1100);
  return (
    <motion.div layout className="pointer-events-auto w-[min(300px,calc(100vw-24px))] rounded-xl border border-[#7a5230]/60 bg-[#1c1714]/80 p-3 text-[#efe6d4] shadow-xl backdrop-blur">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="text-lg">🧭</span>
        <span className="font-display text-[15px] text-[#ffd27a]">{obj.title}</span>
        <span className="ml-auto text-[11px] text-[#cbb89a]">{open ? "▾" : "▸"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="mt-1 text-[12.5px] leading-snug text-[#e8dcc0]">{obj.detail}</p>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#cbb89a]">
              {Object.values(MILESTONES).map((m, i) => (
                <span key={m.id} title={m.title} className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i < count ? "bg-[#e8a33d]" : "bg-[#3a332c]"}`} />
              ))}
              <span className="ml-1">{count}/{Object.keys(MILESTONES).length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function MilestoneBanner({ m }: { m: Milestone | null }) {
  return (
    <AnimatePresence>
      {m && (
        <motion.div key={m.id} initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="pointer-events-none absolute left-1/2 top-20 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-[#e8a33d] bg-gradient-to-b from-[#3b2a1a] to-[#1c1714] px-5 py-3 shadow-[0_0_40px_rgba(232,163,61,0.45)]">
            <motion.span initial={{ rotate: -30, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.15, type: "spring" }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8a33d] text-2xl">{m.icon}</motion.span>
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#e8a33d]">Breakthrough</div>
              <div className="font-display text-2xl leading-tight text-[#f8eed6]">{m.title}</div>
              <div className="text-[13px] text-[#cbb89a]">{m.text}</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ChapterCard({ day, onDone }: { day: number; onDone: () => void }) {
  const subtitle = day === 1 ? "The morning after" : "The village remembers";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 3.2, times: [0, 0.2, 0.75, 1] }}
      onAnimationComplete={onDone}
      className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/55">
      <motion.div initial={{ letterSpacing: "0.1em" }} animate={{ letterSpacing: "0.5em" }} transition={{ duration: 3.2 }}
        className="font-display text-sm uppercase text-[#cbb89a]">Day {day}</motion.div>
      <div className="mt-2 font-display text-5xl text-[#f8eed6] drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] sm:text-6xl">{subtitle}</div>
      <div className="mt-3 h-px w-48 bg-gradient-to-r from-transparent via-[#e8a33d] to-transparent" />
    </motion.div>
  );
}
