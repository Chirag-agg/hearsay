// Small shared pieces: portraits, claim chips, Cypher blocks.
import { useState } from "react";
import type { Chip } from "../api";

const COLORS: Record<string, string> = {
  elena: "#8f6bb3",
  jonas: "#c2412d",
  wren: "#5b8fa8",
  bess: "#e8a33d",
  pip: "#7fa25a",
  aldric: "#d9d0bd",
  tilly: "#e98fa5",
  hale: "#4f6fb3",
  brann: "#9a7b4f",
  imogen: "#4fae9e",
  silas: "#555",
};

export function Portrait({ id, name, size = 40, ring }: { id: string; name: string; size?: number; ring?: string }) {
  const initials = name
    .replace(/^(Father|Lady|Dr\.|Constable)\s+/, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <div
      title={name}
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-ink"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: COLORS[id] ?? "#888",
        boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
      }}
    >
      {initials}
    </div>
  );
}

export function colorOf(id: string): string {
  return COLORS[id] ?? "#888";
}

export function ClaimChip({ chip, onSource }: { chip: Chip; onSource?: (c: Chip) => void }) {
  const heard = chip.reported_as === "heard";
  return (
    <div
      className={`group flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
        heard ? "border-river/40 bg-river/10" : "border-lantern/40 bg-lantern/10"
      }`}
    >
      <span className={`mt-0.5 rounded px-1 text-[10px] font-semibold uppercase ${heard ? "bg-river/30" : "bg-lantern/30"}`}>
        {heard ? "heard" : "saw"}
      </span>
      <span className="flex-1 leading-snug">{chip.label}</span>
      {chip.can_ask_source && onSource && (
        <button className="whitespace-nowrap text-[11px] font-semibold text-river hover:text-lantern" onClick={() => onSource(chip)}>
          Who told you?
        </button>
      )}
    </div>
  );
}

export function CypherBlock({ title, cypher }: { title: string; cypher: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button className="font-mono text-river hover:text-lantern" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && <pre className="cypher mt-1">{cypher}</pre>}
    </div>
  );
}

export function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-lantern border-t-transparent" />
      {text}
    </div>
  );
}
