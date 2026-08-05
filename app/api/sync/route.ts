// app/api/sync/route.ts — nightly Vercel Cron target.
// Reads the real multi-tab LRM workbook (lib/sheets.ts) for the configured
// cluster, upserts Lrm identity + a dated LrmDailyMetric series (the per-day
// MD+DD that drives the 4-week chart and Trend), and refreshes each LRM's open
// Cycle window to the data's date span. Current-snapshot metrics (target, live
// leads, productive hours, lead score, the sheet's own MD+DD/day average) ride
// on the latest daily row, where lib/aggregate.ts reads them.
//
// NEVER writes PlanItemState / CycleDecision / ClusterSetting (human state).
//
// vercel.json: { "crons": [ { "path": "/api/sync", "schedule": "30 20 * * *" } ] }  // 02:00 IST
// Protect it: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CLUSTER } from "@/lib/cluster";
import { fetchClusterRoster, type SheetLrm } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 300;

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

const MON3: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "2-Mar-2024" -> Date (UTC midnight); null if unparseable.
function parseDoj(s: string | null): Date | null {
  const m = String(s ?? "").match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MON3[m[2].toLowerCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(+m[3], mon, +m[1]));
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function upsertLrm(r: SheetLrm) {
  const id = r.email;
  await prisma.lrm.upsert({
    where: { id },
    create: {
      id,
      email: id,
      name: r.name,
      cluster: r.cluster ?? undefined,
      tl: r.tl ?? undefined,
      zsm: r.zsm ?? undefined,
      tenureDays: r.tenureDays ?? undefined,
      doj: parseDoj(r.doj) ?? undefined,
    },
    update: {
      name: r.name,
      cluster: r.cluster ?? undefined,
      tl: r.tl ?? undefined,
      zsm: r.zsm ?? undefined,
      tenureDays: r.tenureDays ?? undefined,
      doj: parseDoj(r.doj) ?? undefined,
    },
  });

  // Daily MD+DD series. If the sheet gave no daily values, fall back to a
  // single "today" row carrying the snapshot metrics.
  const daily = r.daily.length
    ? r.daily.map((d) => ({ date: utcDate(d.date), mdDd: d.mdDd }))
    : [{ date: (() => { const t = new Date(); t.setUTCHours(0, 0, 0, 0); return t; })(), mdDd: 0 }];

  const latestIdx = daily.length - 1;
  for (let i = 0; i < daily.length; i++) {
    const isLatest = i === latestIdx;
    const snapshot = isLatest
      ? {
          target: r.target ?? undefined,
          cal: r.cal ?? undefined,
          oal: r.oal ?? undefined,
          leadScore: r.leadScore ?? undefined,
          productiveHrs: r.prod ?? undefined,
          mdDdPerDay: r.avgPerDay ?? undefined,
        }
      : {};
    await prisma.lrmDailyMetric.upsert({
      where: { lrmId_date: { lrmId: id, date: daily[i].date } },
      create: { lrmId: id, date: daily[i].date, mdDd: daily[i].mdDd, ...snapshot },
      update: { mdDd: daily[i].mdDd, ...snapshot },
    });
  }

  // Refresh the open cycle window to span the data (Sundays excluded from the
  // working-day count). Thresholds come from ClusterSetting; the sync never
  // creates or edits that row's benchmark/guard/model.
  const start = daily[0].date;
  const end = daily[latestIdx].date;
  let workingDays = 0;
  for (const d of daily) if (d.date.getUTCDay() !== 0) workingDays++;

  const existing = await prisma.cycle.findFirst({ where: { lrmId: id, status: "open" }, orderBy: { startDate: "desc" } });
  const setting = await prisma.clusterSetting.findUnique({ where: { cluster: CLUSTER } });
  if (existing) {
    await prisma.cycle.update({
      where: { id: existing.id },
      data: { startDate: start, endDate: end, workingDays: workingDays || 1, target: r.target ?? undefined },
    });
  } else {
    await prisma.cycle.create({
      data: {
        lrmId: id,
        startDate: start,
        endDate: end,
        workingDays: workingDays || 1,
        target: r.target ?? undefined,
        benchmark: setting?.benchmark ?? 4,
        tenureGuard: setting?.tenureGuard ?? 60,
        planModel: setting?.planModel ?? "sprint",
      },
    });
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Make sure the cluster's settings row exists so cycle creation can copy it.
  await prisma.clusterSetting.upsert({ where: { cluster: CLUSTER }, update: {}, create: { cluster: CLUSTER } });

  const records = await withRetry(() => fetchClusterRoster(CLUSTER));
  for (const r of records) await upsertLrm(r);

  return NextResponse.json({
    ok: true,
    cluster: CLUSTER,
    syncedAt: new Date().toISOString(),
    lrms: records.length,
  });
}
