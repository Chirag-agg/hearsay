// Thin client for the HEARSAY backend (backend/app/main.py). Every call returns parsed JSON.

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export type Status = {
  game_id: string;
  session: number;
  tick: number;
  questions_asked: number;
  questions_left: number;
  clock: string;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  sex: "m" | "f";
  adult: boolean;
  build?: string;
  lives_at?: string | null;
  works_at?: string | null;
};

export type Village = {
  game_id: string;
  people: Person[];
  places: { id: string; name: string }[];
  roads: { a: string; b: string; minutes: number }[];
  knows: { a: string; b: string; closeness: number }[];
  facts: { id: string; text: string }[];
  gossip_hubs: { id: string; name: string; score: number }[];
  circles: { community: number; members: string[] }[];
  cypher: Record<string, string>;
};

export type Chip = {
  claim_id: string;
  label: string;
  pred: string;
  about: string | null;
  place: string | null;
  t_from: number;
  t_to: number;
  reported_as: "saw" | "heard";
  heard_from: string | null;
  can_ask_source: boolean;
};

export type Contradiction = {
  key: string;
  kind: string;
  detail: string;
  claim_1: string;
  claim_2: string;
  stmt_1?: string;
  stmt_2?: string;
  implicates?: string | null;
  implicates_name?: string | null;
  tick?: number;
};

export type GameEvent = { seq: number; at: number; type: string; [k: string]: unknown };

export type Answer = {
  statement_id: string;
  villager: string;
  name: string;
  question: string;
  dialogue: string;
  emotion: string;
  mode: string;
  guardrail_ok: boolean;
  claims: Chip[];
  withheld: number;
  contradictions_new: Contradiction[];
  events: GameEvent[];
  status: Status;
};

export type Source = {
  claim_id: string;
  teller: string;
  source: string | null;
  source_name?: string;
  dialogue: string;
  ask_next?: { villager_id: string; about_claim_id: string };
};

export type TraceHop = {
  claim_id: string;
  teller: string;
  teller_name: string;
  about: string;
  place: string;
  time: string;
  reported_as: string;
  changed: string[];
};

export type Trace = { claim_id: string; chain: TraceHop[]; reached_eyewitness: boolean; ask_next: string | null };

export type Ranking = {
  suspect_id: string;
  suspect: string;
  motive: number;
  means: number;
  lies: number;
  fits: number;
  alibi: boolean;
  score: number;
};

export type Suspects = { sighting: string | null; sighting_text: string | null; ranking: Ranking[] };

export type BoardNode = { id: string; kind: string; [k: string]: unknown };
export type Board = { nodes: BoardNode[]; links: { source: string; target: string; type: string }[] };

export type DetectiveStep = {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  why: string;
  summary: string;
  cypher: { query: string; cypher: string }[];
};

export type Verdict = {
  accusation_id: string;
  suspect_id: string;
  correct: boolean;
  motive_correct: boolean;
  evidence: Record<string, string[]>;
  score: number;
  summary: string;
};

export type Reveal = {
  verdict: Verdict;
  truth: { killer: string; victim: string; time: string; weapon: string; place: string; timeline: { time: string; text: string }[] };
  sighting_rumor: { from: string; to: string; tick: number; changed: string | null; before: string | null; after: string | null }[];
  gossip: { hops: number; mutated: number };
  lies_caught: { kind: string; detail: string; liar: string | null }[];
};

export type GodClaim = {
  id: string;
  pred: string;
  about: string | null;
  place: string | null;
  t_from: number;
  t_to: number;
  origin: string;
  confidence: number;
  mutated: string | null;
  secret: boolean;
  heard_from: string | null;
};

export type QueryLog = {
  recent: { at: number; graph: string; query: string; ms: number; rows: number; readonly: boolean; error: string | null }[];
  stats: { query: string; calls: number; total_ms: number; mean_ms: number; features: string[] }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const api = {
  newGame: () => post<Status & { evicted: string[] }>("/games"),
  status: (g: string) => call<Status>(`/games/${g}`),
  newSession: (g: string) => post<Status>(`/games/${g}/session`),
  village: (g: string) => call<Village>(`/games/${g}/village`),
  ask: (g: string, villager_id: string, question: string, opts: { about_claim_id?: string; cite_statement_ids?: string[] } = {}) =>
    post<Answer>(`/games/${g}/ask`, { villager_id, question, ...opts }),
  source: (g: string, claimId: string) => post<Source>(`/games/${g}/claims/${claimId}/source`),
  trace: (g: string, claimId: string) => call<Trace>(`/games/${g}/trace/${claimId}`),
  board: (g: string) => call<Board>(`/games/${g}/case`),
  contradictions: (g: string) =>
    call<{ contradictions: Contradiction[]; leads: Record<string, unknown>[] }>(`/games/${g}/contradictions`),
  suspects: (g: string) => call<Suspects>(`/games/${g}/suspects`),
  detective: (g: string) => post<{ mode: string; steps: DetectiveStep[]; report: string }>(`/games/${g}/detective`, {}),
  accuse: (g: string, suspect_id: string, motive: string, statement_ids: string[]) =>
    post<Verdict>(`/games/${g}/accuse`, { suspect_id, motive, statement_ids }),
  reveal: (g: string) => call<Reveal>(`/games/${g}/reveal`),
  god: (g: string) => call<Record<string, { claims: GodClaim[]; heard: number; mutated: number }>>(`/games/${g}/god`),
  queries: (limit = 60) => call<QueryLog>(`/debug/queries?limit=${limit}`),
  events: (g: string, since: number) => call<{ events: GameEvent[] }>(`/games/${g}/events?since=${since}`),
};

export function hhmm(t: number): string {
  const h = Math.floor(t / 60) % 24;
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
