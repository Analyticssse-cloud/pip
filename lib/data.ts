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

async function loadFromDb(): Promise<ClusterData | null> {
  if (!prisma) return null;
  try {
    const rows = await prisma.lrm.findMany({
      include: { metrics: { orderBy: { date: "desc" }, take: 1 } },
    });
    if (rows.length === 0) return null;

    const setting = await prisma.clusterSetting.findFirst();
    const thresholds: Thresholds = {
      benchmark: setting?.benchmark ?? SAMPLE_THRESHOLDS.benchmark,
      tenureGuard: setting?.tenureGuard ?? SAMPLE_THRESHOLDS.tenureGuard,
      workingDays: SAMPLE_THRESHOLDS.workingDays,
    };

    const lrms: LrmMetrics[] = rows.map(r => {
      const m = r.metrics[0];
      const perDay = m?.mdDdPerDay ?? 0;
      // weeks: use a per-day source when present; otherwise flatten the rolling average.
      // TODO(sync): populate a real 4-week MD+DD series from the daily report.
      const weeks: [number, number, number, number] = [perDay, perDay, perDay, perDay];
      return {
        id: r.id, name: r.name, email: r.email,
        tl: r.tl ?? "", zsm: r.zsm ?? "", city: r.city ?? "",
        tenureDays: r.tenureDays ?? 0,
        target: m?.target ?? 0,
        ach: (m?.mdDd ?? 0),
        cal: m?.cal ?? 0,
        oal: m?.oal ?? 0,
        leadScore: m?.leadScore ?? 0,
        prod: m?.productiveHrs ?? 0,
        conv: m?.bqlToMd ?? 0,
        weeks,
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
