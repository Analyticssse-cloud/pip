// lib/aggregate.ts — turns synced Postgres rows (Lrm + LrmDailyMetric) into
// the LrmMetrics + Thresholds shapes lib/metrics.ts expects, and owns the
// "open a plan creates a Cycle" rule from DATA_MODEL.md §4.
//
// Per-LRM cycle math (`ach`, the four `weeks[]` buckets) is derived here from
// LrmDailyMetric.mdDd. That column is 0 until the sync job is wired to a
// per-day MD+DD source (see app/api/sync/route.ts and lib/metabase.ts) —
// until then every roster figure reads 0/blocked, which is expected on a
// fresh sync, not a bug in this module.

import { prisma } from "./db";
import type { LrmMetrics, Thresholds } from "./metrics";
import type { Entry } from "./derive";

const DAY_MS = 24 * 60 * 60 * 1000;

// Sundays off — matches the cycle's working-day convention (WD=26 of ~30).
function isWorkingDay(d: Date) {
  return d.getUTCDay() !== 0;
}

function countWorkingDays(start: Date, end: Date): number {
  let n = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= stop) {
    if (isWorkingDay(d)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

interface ClusterDefaults {
  benchmark: number;
  tenureGuard: number;
  planModel: string;
}

/** Opening a plan for an LRM with no open Cycle creates one — DATA_MODEL.md §4. */
export async function getOrCreateOpenCycle(lrmId: string, defaults: ClusterDefaults) {
  const existing = await prisma.cycle.findFirst({
    where: { lrmId, status: "open" },
    orderBy: { startDate: "desc" },
  });
  if (existing) return existing;

  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + 30 * DAY_MS);

  return prisma.cycle.create({
    data: {
      lrmId,
      startDate,
      endDate,
      workingDays: countWorkingDays(startDate, endDate) || 26,
      benchmark: defaults.benchmark,
      tenureGuard: defaults.tenureGuard,
      planModel: defaults.planModel,
    },
  });
}

function bucketWeeks(rows: { date: Date; mdDd: number }[], cycleStart: Date): [number, number, number, number] {
  const sums: [number, number, number, number] = [0, 0, 0, 0];
  const wds: [number, number, number, number] = [0, 0, 0, 0];
  for (const r of rows) {
    const dayIdx = Math.floor((r.date.getTime() - cycleStart.getTime()) / DAY_MS);
    if (dayIdx < 0) continue;
    const wk = Math.min(3, Math.floor(dayIdx / 7));
    sums[wk] += r.mdDd;
    if (isWorkingDay(r.date)) wds[wk]++;
  }
  return sums.map((sum, i) => (wds[i] ? +(sum / wds[i]).toFixed(2) : 0)) as [number, number, number, number];
}

export async function buildRoster(cluster: string): Promise<{ entries: Entry[]; setting: ClusterDefaults & { cluster: string } }> {
  const setting = await prisma.clusterSetting.upsert({
    where: { cluster },
    update: {},
    create: { cluster },
  });

  const lrms = await prisma.lrm.findMany({
    where: { cluster },
    include: { metrics: { orderBy: { date: "asc" } } },
  });

  const today = new Date();

  const entries: Entry[] = [];
  for (const lrm of lrms) {
    const cycle = await getOrCreateOpenCycle(lrm.id, setting);
    const rows = lrm.metrics.filter((m) => m.date >= cycle.startDate);
    const latest = rows[rows.length - 1];
    const ach = rows.reduce((sum, r) => sum + (r.mdDd ?? 0), 0);

    const metrics: LrmMetrics = {
      id: lrm.id,
      name: lrm.name,
      email: lrm.email,
      tl: lrm.tl ?? "—",
      zsm: lrm.zsm ?? "—",
      city: lrm.city ?? "—",
      tenureDays: lrm.tenureDays ?? 0,
      target: latest?.target ?? 0,
      ach,
      cal: latest?.cal ?? 0,
      oal: latest?.oal ?? 0,
      leadScore: latest?.leadScore ?? 0,
      prod: latest?.productiveHrs ?? 0,
      conv: latest?.bqlToMd ?? 0,
      weeks: bucketWeeks(rows, cycle.startDate),
    };

    const thresholds: Thresholds = {
      benchmark: cycle.benchmark,
      tenureGuard: cycle.tenureGuard,
      workingDays: cycle.workingDays,
    };

    entries.push({
      metrics,
      cycleId: cycle.id,
      thresholds,
      daysElapsed: Math.min(thresholds.workingDays, countWorkingDays(cycle.startDate, today)),
    });
  }

  return { entries, setting: { ...setting, cluster } };
}
