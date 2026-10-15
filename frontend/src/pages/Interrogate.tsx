// Interrogation: question one villager. Answers show their claims as chips; heard claims get
// "Who told you?", which names the source and offers to ask them about the same rumor.
import { useEffect, useRef, useState } from "react";
import type { GameCtx } from "../App";
import { api, type Answer, type Chip, type Source } from "../api";
import { ClaimChip, Portrait, Spinner } from "../components/bits";

type Turn = { kind: "answer"; a: Answer } | { kind: "source"; s: Source; chip: Chip };

const SUGGESTIONS: Record<string, string[]> = {
  bess: ["Who was at the tavern last night?", "Did you see anyone near the mill?"],
  hale: ["Who was at the tavern last night?"],
  imogen: ["Who was at the tavern last night?"],
  tilly: ["Did you see Elena or Jonas at the smithy, and did Silas threaten anyone?"],
  aldric: ["When did Elena leave the chapel?"],
  elena: ["Where were you between 21:00 and 22:00?"],
  jonas: ["Where were you between 21:00 and 22:00?"],
  wren: ["Was Jonas with you last night?"],
  pip: ["What did you see on the river path at 21:30?"],
  brann: ["Who found Silas this morning?"],
};

export default function InterrogatePage({ ctx }: { ctx: GameCtx }) {
  const people = ctx.village.people.filter((p) => p.id !== "silas");
  const [who, setWho] = useState(ctx.focus.villager ?? ctx.village.gossip_hubs[0]?.id ?? "bess");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => ctx.answers.map((a) => ({ kind: "answer", a })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cites, setCites] = useState<string[]>([]);
  const [about, setAbout] = useState<{ claimId: string; label: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const person = people.find((p) => p.id === who)!;

  useEffect(() => {
    if (ctx.focus.villager) setWho(ctx.focus.villager);
  }, [ctx.focus.villager]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" }); // newer Chromium returns a Promise; don't return it
  }, [turns, busy]);

  const ask = async (q: string, opts: { about_claim_id?: string } = {}) => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.ask(ctx.g, who, q, { ...opts, cite_statement_ids: cites });
      ctx.addAnswer(a);
      setTurns((t) => [...t, { kind: "answer", a }]);
      setQuestion("");
      setCites([]);
      setAbout(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const whoTold = async (chip: Chip) => {
    try {
      const s = await api.source(ctx.g, chip.claim_id);
      setTurns((t) => [...t, { kind: "source", s, chip }]);
    } catch (e) {
      setError(String(e));
    }
  };

  const followUp = (s: Source, chip: Chip) => {
    if (!s.ask_next) return;
    setWho(s.ask_next.villager_id);
    setAbout({ claimId: s.ask_next.about_claim_id, label: chip.label });
    setQuestion(`What did you hear about that? Who told you?`);
  };

  const statements = ctx.answers;

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="card space-y-1 p-2">
        {people.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setWho(p.id);
              setAbout(null);
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
              who === p.id ? "bg-lantern/15 text-lantern" : "hover:bg-edge/50"
            }`}
          >
            <Portrait id={p.id} name={p.name} size={30} ring={p.id === ctx.village.gossip_hubs[0]?.id ? "#e8a33d" : undefined} />
            <span className="leading-tight">
              {p.name}
              <span className="block text-[11px] text-muted">{p.role}</span>
            </span>
          </button>
        ))}
      </aside>

      <section className="card flex min-h-[70vh] flex-col">
        <div className="flex items-center gap-3 border-b border-edge p-3">
          <Portrait id={person.id} name={person.name} size={44} />
          <div>
            <div className="font-display text-xl">{person.name}</div>
            <div className="text-xs text-muted">{person.role}</div>
          </div>
          <button className="btn ml-auto" onClick={() => ctx.goTo("Case board")}>
            Case board →
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          {turns.length === 0 && <p className="text-sm text-muted">Ask your first question. Each one costs 30 minutes of the day.</p>}
          {turns.map((t, i) =>
            t.kind === "answer" ? (
              <div key={i} className="space-y-2">
                <div className="ml-auto max-w-[80%] rounded-xl bg-edge/60 px-3 py-2 text-sm">
                  <span className="text-muted">You → {t.a.name}:</span> {t.a.question}
                </div>
                <div className="flex gap-3">
                  <Portrait id={t.a.villager} name={t.a.name} size={34} />
                  <div className="flex-1 space-y-2">
                    <p className="font-display text-lg leading-snug">“{t.a.dialogue}”</p>
                    <div className="grid gap-1.5">
                      {t.a.claims.map((c) => (
                        <ClaimChip key={c.claim_id} chip={c} onSource={whoTold} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                      <span>{t.a.mode}</span>
                      <span>· guardrail {t.a.guardrail_ok ? "passed" : "FAILED"}</span>
                      {t.a.withheld > 0 && <span className="text-lantern">· holding something back</span>}
                    </div>
                    {t.a.contradictions_new.map((c) => (
                      <div key={c.key} className="rounded-lg border border-blood/50 bg-blood/10 px-3 py-1.5 text-xs text-blood">
                        Contradiction: {c.detail}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div key={i} className="ml-12 rounded-lg border border-river/40 bg-river/10 p-3 text-sm">
                <div>
                  <span className="text-muted">Who told you “{t.chip.label}”</span> — {t.s.dialogue}
                </div>
                {t.s.ask_next && (
                  <button className="btn mt-2" onClick={() => followUp(t.s, t.chip)}>
                    Ask {t.s.source_name} about it (30 min)
                  </button>
                )}
                <button className="btn ml-2 mt-2" onClick={() => ctx.goTo("Case board", { claimId: t.chip.claim_id })}>
                  Trace this rumor
                </button>
              </div>
            ),
          )}
          {busy && <Spinner text={`${person.name} is thinking… (and the village keeps talking)`} />}
          <div ref={end} />
        </div>

        <div className="space-y-2 border-t border-edge p-3">
          {about && (
            <div className="flex items-center gap-2 rounded-md bg-river/10 px-2 py-1 text-xs text-river">
              Asking about: {about.label}
              <button className="ml-auto text-muted hover:text-parchment" onClick={() => setAbout(null)}>
                ×
              </button>
            </div>
          )}
          {statements.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">Show them an earlier statement ({cites.length} chosen)</summary>
              <div className="mt-1 max-h-32 space-y-1 overflow-auto">
                {statements.map((s) => (
                  <label key={s.statement_id} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={cites.includes(s.statement_id)}
                      onChange={(e) =>
                        setCites((c) => (e.target.checked ? [...c, s.statement_id] : c.filter((x) => x !== s.statement_id)))
                      }
                    />
                    <span>
                      <b>{s.name}:</b> {s.dialogue.slice(0, 120)}
                    </span>
                  </label>
                ))}
              </div>
            </details>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(SUGGESTIONS[who] ?? []).map((s) => (
              <button key={s} className="rounded-full border border-edge px-2.5 py-0.5 text-xs text-muted hover:text-lantern"
                onClick={() => setQuestion(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question, about ? { about_claim_id: about.claimId } : {});
            }}
          >
            <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask ${person.name.split(" ")[0]} something…`} disabled={busy || ctx.status.questions_left <= 0} />
            <button className="btn-primary" disabled={busy || !question.trim() || ctx.status.questions_left <= 0}>
              Ask
            </button>
          </form>
          {error && <p className="text-xs text-blood">{error}</p>}
        </div>
      </section>
    </div>
  );
}
