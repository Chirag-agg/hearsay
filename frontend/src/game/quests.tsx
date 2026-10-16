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

export type Step = Objective & { id: string; done: boolean; optional?: boolean; accuse?: boolean };

/** The case as a short checklist, worked out from what the villagers have told you. The first open
 *  step that isn't optional is the one to do now; its targets get the gold "!" on the map. */
export function caseSteps(answers: Answer[], unlocked: Set<string>, hub: string | undefined, names: Record<string, string>,
  pendingSource: { id: string; name: string } | null): Step[] {
  const asked = new Set(answers.map((a) => a.villager));
  const first = (id: string) => (names[id] ?? id).replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0];
  const gossip = hub ? first(hub) : "the barkeep";
  const alibis = ["elena", "jonas", "aldric"].filter((v) => !asked.has(v));
  const steps: Step[] = [
    { id: "gossip", step: 1, title: "Hear the gossip", done: !!hub && asked.has(hub), targets: hub ? [hub] : [],
      detail: `${gossip} at the Tavern hears everything. Ask what people are saying about last night.` },
    { id: "source", step: 2, title: "Find who really saw it", done: unlocked.has("source"),
      targets: pendingSource ? [pendingSource.id] : hub ? [hub] : [],
      detail: pendingSource
        ? `${pendingSource.name} passed the story on. Go and ask where they heard it.`
        : `Someone was seen near the Mill with a lantern. Stories change as they pass along, so ask ${gossip} “Who told you?” and follow it to whoever saw it.` },
    { id: "alibis", step: 3, title: "Check the alibis", done: unlocked.has("lie"), targets: alibis.length ? alibis : ["aldric"],
      detail: "Ask Elena and Jonas where they were between 21:00 and 22:00, and ask Father Aldric when Elena left the Chapel. Look for a story that doesn't match." },
    { id: "motive", step: 4, title: "Motive and means", done: unlocked.has("motive") && unlocked.has("means"), targets: ["tilly"],
      detail: "Who owed Silas money? Who was at the Smithy, where the hammer went missing? Little Tilly notices things." },
    { id: "jonas", step: 5, title: "Where was Jonas?", done: unlocked.has("secret"), optional: true, targets: ["wren"],
      detail: "Jonas was seen leaving the Tavern toward the Manor. Lady Wren may know why." },
    { id: "accuse", step: 6, title: "Name the killer", done: unlocked.has("closed"), accuse: true, targets: [],
      detail: "When you're ready, accuse. Your notebook's evidence goes with you." },
  ];
  return steps;
}

/** The step to do now. */
export function currentStep(steps: Step[]): Step {
  return steps.find((s) => !s.done && !s.optional) ?? steps[steps.length - 1];
}

/** Kept for callers that want one line: the current step. */
export function objective(answers: Answer[], unlocked: Set<string>, hub: string | undefined, names: Record<string, string>,
  pendingSource: { id: string; name: string } | null): Objective {
  return currentStep(caseSteps(answers, unlocked, hub, names, pendingSource));
}

export function CaseFile({ steps, names, onGo, onAccuse }: {
  steps: Step[];
  names: Record<string, string>;
  onGo: (villager: string) => void;
  onAccuse: () => void;
}) {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);
  const now = currentStep(steps);
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const first = (id: string) => (names[id] ?? id).replace(/^(Father|Lady|Dr\.|Constable) /, "").split(" ")[0];
  return (
    <motion.div layout className="pointer-events-auto w-[min(310px,calc(100vw-24px))] rounded-xl border border-[#7a5230]/60 bg-[#1c1714]/85 p-3 text-[#efe6d4] shadow-xl backdrop-blur">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="font-display text-[16px] text-[#ffd27a]">Case file</span>
        <span className="text-[12px] text-[#cbb89a]">{done} of {required.length}</span>
        <span className="ml-auto text-[11px] text-[#cbb89a]">{open ? "▾" : "▸"}</span>
      </button>
      {!open && <div className="mt-1 text-[13px] text-[#f8eed6]">Next: {now.title}</div>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="mt-2 space-y-1.5 overflow-hidden">
            {steps.map((s) => {
              const isNow = s.id === now.id;
              return (
                <li key={s.id} className={`rounded-lg px-2 py-1.5 ${isNow ? "bg-[#e8a33d]/15 ring-1 ring-[#e8a33d]/60" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      s.done ? "bg-[#7fae5a] text-[#1c1714]" : isNow ? "bg-[#e8a33d] text-[#1c1714]" : "bg-[#3a332c] text-[#cbb89a]"}`}>
                      {s.done ? "✓" : s.optional ? "?" : s.step}
                    </span>
                    <span className={`text-[13.5px] ${s.done ? "text-[#9a8f80] line-through" : isNow ? "font-semibold text-[#f8eed6]" : "text-[#cbb89a]"}`}>
                      {s.title}{s.optional && !s.done ? " (optional)" : ""}
                    </span>
                  </div>
                  {(isNow || (s.optional && !s.done && now.step > 3)) && (
                    <div className="ml-7 mt-1">
                      <p className="text-[12.5px] leading-snug text-[#e8dcc0]">{s.detail}</p>
                      {s.accuse ? (
                        <button className="wood mt-1.5 text-[13px]" onClick={onAccuse}>⚖ Accuse now</button>
                      ) : s.targets[0] && (
                        <button className="wood mt-1.5 text-[13px]" onClick={() => onGo(s.targets[0])}>Go to {first(s.targets[0])} →</button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </motion.ol>
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
