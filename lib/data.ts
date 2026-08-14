// lib/data.ts — loads the cluster roster + persisted human state for the read views.
//
// Order of preference:
//   1. Postgres (when DATABASE_URL is set AND the roster is populated by the sync job)
//   2. the bundled sample roster (lib/sample.ts) so a fresh deploy renders immediately.
//
// Persisted state (checkbox ticks + cycle decisions) is read from Postgres when available;
// in sample mode the client hydrates it from localStorage (see components/Shell.tsx).
import type { LrmMetrics, Thresholds } from "./metrics";
import { SAMPLE_LRMS, SAMPLE_THRESHOLDS } from "./sample";
import { prisma } from "./db";

export interface DecisionRecord { outcome: string; note: string; decidedAt: string }

export interface ClusterData {
  lrms: LrmMetrics[];
  thresholds: Thresholds;
  source: "db" | "sample";
  fetchedAt: string;                              // ISO — drives the "Refreshed HH:MM" stamp
  planState: Record<string, boolean>;             // `${lrmId}:${model}:${itemKey}` -> done
  decisions: Record<string, DecisionRecord>;      // lrmId -> decision
}

function key(lrmId: string, model: string, phase: string, itemKey: string) {
  return `${lrmId}:${model}:${phase}:${itemKey}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fold a chronological daily MD+DD series into four weekly averages, oldest
 * week first. Each bucket is a 7-day window back from the most recent day, and
 * divides by that window's working days (Sundays off) — so the numbers read as
 * "MD+DD per working day", the same unit the benchmark is in.
 */
function weeklyAverages(series: { date: Date; mdDd: number }[]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  if (series.length === 0) return out;

  const last = series[series.length - 1].date.getTime();
  const sums = [0, 0, 0, 0];
  const days = [0, 0, 0, 0];

  for (const row of series) {
    const daysAgo = Math.floor((last - row.date.getTime()) / DAY_MS);
    if (daysAgo < 0 || daysAgo > 27) continue;
    // daysAgo 0-6 is the most recent week, which is week 4 on screen.
    const bucket = 3 - Math.floor(daysAgo / 7);
    sums[bucket] += row.mdDd;
    if (row.date.getUTCDay() !== 0) days[bucket]++;
  }

  for (let i = 0; i < 4; i++) out[i] = days[i] ? +(sums[i] / days[i]).toFixed(2) : 0;
  return out;
}

async function loadFromDb(): Promise<ClusterData | null> {
  if (!prisma) return null;
  try {
    const rows = await prisma.lrm.findMany({
      // The whole recent series, not just the latest row — the Trend screen and
      // the phase gates read week-on-week movement, so a single snapshot is not
      // enough. Ordered oldest-first so weeklyAverages() can bucket it.
      include: { metrics: { orderBy: { date: "asc" } } },
    });
    if (rows.length === 0) return null;

    const setting = await prisma.clusterSetting.findFirst();
    const thresholds: Thresholds = {
      benchmark: setting?.benchmark ?? SAMPLE_THRESHOLDS.benchmark,
      tenureGuard: setting?.tenureGuard ?? SAMPLE_THRESHOLDS.tenureGuard,
      workingDays: SAMPLE_THRESHOLDS.workingDays,
    };

    const lrms: LrmMetrics[] = rows.map(r => {
      const series = r.metrics;
      const m = series[series.length - 1]; // latest row carries the snapshot metrics
      return {
        id: r.id, name: r.name, email: r.email,
        tl: r.tl ?? "", zsm: r.zsm ?? "", city: r.city ?? "",
        tenureDays: r.tenureDays ?? 0,
        target: m?.target ?? 0,
        // Cycle-to-date output, not a single day's.
        ach: series.reduce((sum, row) => sum + (row.mdDd ?? 0), 0),
        cal: m?.cal ?? 0,
        oal: m?.oal ?? 0,
        leadScore: m?.leadScore ?? 0,
        prod: m?.productiveHrs ?? 0,
        conv: m?.bqlToMd ?? 0,
        weeks: weeklyAverages(series),
        // The sheet's own MD+DD/day column is what the business reads, so it
        // wins over ach/workingDays for banding when the sync captured it.
        avgPerDayOverride: m?.mdDdPerDay ?? undefined,
      };
    });

    const [items, decisions] = await Promise.all([
      prisma.planItemState.findMany({ include: { cycle: true } }),
      prisma.cycleDecision.findMany({ include: { cycle: true } }),
    ]);

    const planState: Record<string, boolean> = {};
    for (const it of items) planState[key(it.cycle.lrmId, it.model, it.phase, it.itemKey)] = it.done;

    const decMap: Record<string, DecisionRecord> = {};
    for (const d of decisions) decMap[d.cycle.lrmId] = {
      outcome: d.outcome, note: d.note ?? "", decidedAt: d.decidedAt.toISOString(),
    };

    return { lrms, thresholds, source: "db", fetchedAt: new Date().toISOString(), planState, decisions: decMap };
  } catch {
    return null; // DB unreachable / not migrated yet — fall back to sample
  }
}

export async function loadCluster(): Promise<ClusterData> {
  const db = await loadFromDb();
  if (db) return db;
  return {
    lrms: SAMPLE_LRMS,
    thresholds: SAMPLE_THRESHOLDS,
    source: "sample",
    fetchedAt: new Date().toISOString(),
    planState: {},
    decisions: {},
  };
}
