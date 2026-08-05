// lib/derive.ts — the client-safe view-model builder. This is the
// TypeScript equivalent of the prototype's renderVals(): pure functions over
// LrmMetrics + Thresholds (from lib/metrics.ts) that produce exactly the
// strings/colors/widths the three screens render. No DB access here —
// app/page.tsx (via lib/aggregate.ts) is the only place that touches Prisma;
// everything below runs equally well on the server or inside the client
// component tree.

import type { Band, Cause, LrmMetrics, Phase, PlanItem, PlanModel, Thresholds } from "./metrics";
import { BARS, avgPerDay, bandOf, causeOf, phases as genPhases, trajectoryOf } from "./metrics";

export interface Entry {
  metrics: LrmMetrics;
  cycleId: string;
  thresholds: Thresholds;
  daysElapsed?: number;
}

export interface Enriched extends Entry {
  avg: number;
  band: Band;
  cause: Cause;
  trajectory: ReturnType<typeof trajectoryOf>;
  /** week-on-week shown in the roster table: latest week vs the one before it. */
  delta: number;
}

export interface DecisionInfo {
  outcome: string;
  note: string | null;
  decidedAt: string;
}

export function enrich(e: Entry): Enriched {
  const avg = avgPerDay(e.metrics, e.thresholds);
  return {
    ...e,
    avg,
    band: bandOf(e.metrics, e.thresholds),
    cause: causeOf(e.metrics),
    trajectory: trajectoryOf(e.metrics),
    delta: e.metrics.weeks[3] - e.metrics.weeks[2],
  };
}

export function enrichAll(entries: Entry[]): Enriched[] {
  return entries.map(enrich).sort((a, b) => a.avg - b.avg);
}

/** Everyone below benchmark, plus anyone with zero live leads — the watchlist. */
export function trackedOf(all: Enriched[], benchmark: number): Enriched[] {
  return all.filter((l) => l.avg < benchmark || l.metrics.cal === 0);
}

export const BAND_STYLE: Record<Band, { bg: string; fg: string }> = {
  "PIP / exit": { bg: "var(--color-accent-900)", fg: "var(--color-bg)" },
  "Train": { bg: "var(--color-accent-200)", fg: "var(--color-accent-800)" },
  "Fix allocation": { bg: "var(--color-accent-600)", fg: "var(--color-bg)" },
  "Observe": { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" },
  "No action": { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-700)" },
};

export interface Bucket {
  label: string;
  count: number;
  action: Band;
  bg: string;
  fg: string;
  w: string;
}

export function bucketsOf(all: Enriched[]): Bucket[] {
  const defs: [string, (l: Enriched) => boolean, Band][] = [
    ["≥ 10 MD+DD", (l) => l.avg >= 10, "No action"],
    ["7–10 MD+DD", (l) => l.avg >= 7 && l.avg < 10, "Observe"],
    ["4–7 MD+DD", (l) => l.avg >= 4 && l.avg < 7, "Train"],
    ["2–4 MD+DD", (l) => l.avg >= 2 && l.avg < 4, "Train"],
    ["0–2 MD+DD", (l) => l.avg > 0 && l.avg < 2, "PIP / exit"],
    ["0 MD+DD", (l) => l.avg === 0, "PIP / exit"],
  ];
  const total = all.length || 1;
  return defs.map(([label, fn, action]) => {
    const count = all.filter(fn).length;
    const st = BAND_STYLE[action];
    return { label, count, action, bg: st.bg, fg: st.fg, w: Math.round((count / total) * 100) + "%" };
  });
}

export function deltaBits(d: number) {
  if (Math.abs(d) < 0.05) return { label: "—", fg: "color-mix(in srgb, var(--color-text) 45%, transparent)" };
  if (d > 0) return { label: "▲ +" + d.toFixed(1), fg: "var(--color-accent-700)" };
  return { label: "▼ " + d.toFixed(1), fg: "var(--color-neutral-800)" };
}

export interface MetricCard {
  label: string;
  value: string;
  bench: string;
  w: string;
  color: string;
  status: string;
}

function metricCard(label: string, value: number, benchVal: number, valLabel: string, benchLabel: string): MetricCard {
  const ratio = benchVal ? value / benchVal : 0;
  const ok = ratio >= 1;
  const near = ratio >= 0.85;
  return {
    label,
    value: valLabel,
    bench: benchLabel,
    w: Math.min(100, Math.round(ratio * 100)) + "%",
    color: ok ? "var(--color-accent-700)" : near ? "var(--color-accent-500)" : "var(--color-accent-900)",
    status: ok ? "At or above the bar" : Math.round((1 - ratio) * 100) + "% short of the bar",
  };
}

export function metricsOf(l: Enriched): MetricCard[] {
  const b = l.thresholds.benchmark;
  const m = l.metrics;
  return [
    metricCard("MD+DD per day", l.avg, b, l.avg.toFixed(1), b.toFixed(1)),
    metricCard("Live leads", m.cal, BARS.CAL, String(m.cal), String(BARS.CAL)),
    metricCard("Productive hours", m.prod, BARS.PROD, m.prod.toFixed(1) + "h", BARS.PROD.toFixed(1) + "h"),
    metricCard("BQL to MD", m.conv, BARS.CONV, m.conv + "%", BARS.CONV + "%"),
  ];
}

export interface WeekBar {
  label: string;
  val: string;
  h: string;
  color: string;
}

const MAX_WEEK = 12;

export function weekBarsOf(l: Enriched): WeekBar[] {
  return l.metrics.weeks.map((v, i) => ({
    label: "Wk " + (i + 1),
    val: v.toFixed(1),
    h: Math.max(2, Math.round((v / MAX_WEEK) * 104)) + "px",
    color: v >= l.thresholds.benchmark ? "var(--color-accent-700)" : "var(--color-accent-400)",
  }));
}

export function benchLine(benchmark: number): string {
  return Math.round((benchmark / MAX_WEEK) * 104) + 26 + "px";
}

export type PlanItemState = PlanItem & { done: boolean };
export type PhaseState = Omit<Phase, "items"> & { items: PlanItemState[] };

/** Generates the plan from lib/metrics.ts and merges persisted checkbox state onto it by (cycle, model, phase, itemKey) — DATA_MODEL.md §3. */
export function phasesWithState(l: Enriched, model: PlanModel, doneMap: Record<string, boolean>): PhaseState[] {
  const raw = genPhases(l.metrics, l.thresholds, model);
  return raw.map((p) => ({
    ...p,
    items: p.items.map((it) => ({
      ...it,
      done: !!doneMap[planItemKey(l.cycleId, model, p.label, it.itemKey)],
    })),
  }));
}

export function planItemKey(cycleId: string, model: PlanModel, phase: string, itemKey: string): string {
  return `${cycleId}:${model}:${phase}:${itemKey}`;
}

export function planTotals(phases: PhaseState[]) {
  const total = phases.reduce((n, p) => n + p.items.length, 0);
  const done = phases.reduce((n, p) => n + p.items.filter((i) => i.done).length, 0);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export interface TrendCell {
  val: string;
  w: string;
  color: string;
}

export interface TrendRow {
  name: string;
  band: Band;
  cells: TrendCell[];
  delta: string;
  deltaFg: string;
  trajectory: string;
  tagBg: string;
  tagFg: string;
}

export function trendRowsOf(tracked: Enriched[]): TrendRow[] {
  return tracked.map((l) => {
    const d = l.metrics.weeks[3] - l.metrics.weeks[0];
    const db = deltaBits(d);
    const tj = l.trajectory;
    const st =
      tj === "Improving"
        ? { bg: "var(--color-accent-200)", fg: "var(--color-accent-800)" }
        : tj === "Sliding"
          ? { bg: "var(--color-accent-900)", fg: "var(--color-bg)" }
          : { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" };
    return {
      name: l.metrics.name,
      band: l.band,
      cells: l.metrics.weeks.map((v) => ({
        val: v.toFixed(1),
        w: Math.round((v / MAX_WEEK) * 100) + "%",
        color: v >= l.thresholds.benchmark ? "var(--color-accent-600)" : "var(--color-accent-300)",
      })),
      delta: db.label,
      deltaFg: db.fg,
      trajectory: tj,
      tagBg: st.bg,
      tagFg: st.fg,
    };
  });
}
