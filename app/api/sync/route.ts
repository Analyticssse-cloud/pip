// app/api/sync/route.ts — nightly Vercel Cron target.
// Pulls the LRM band sheet, upserts Lrm + a dated LrmDailyMetric snapshot.
// NEVER writes PlanItemState / CycleDecision / ClusterSetting (human state).
//
// vercel.json:
//   { "crons": [ { "path": "/api/sync", "schedule": "30 20 * * *" } ] }   // 02:00 IST
//
// Protect it: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { fetchLrmBand, normalizeEmail, type SheetLrm } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

const prisma = new PrismaClient();

// Retry-with-backoff — the productive-hour numbers ultimately trace to a replica that throws
// recovery-conflict errors; and the Sheets API rate-limits. Keep syncs resilient.
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 500 * 2 ** i)); }
  }
  throw lastErr;
}

// Derive a person's display name from the email local part (matches the prototype).
function nameFromEmail(email: string): string {
  return email.split("@")[0].split(/[._]/)
    .filter(p => !/^\d+$/.test(p))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const range = process.env.SHEET_LRM_BAND_RANGE ?? "Today's Plan!A1:ZZ400";
  const records: SheetLrm[] = await withRetry(() => fetchLrmBand(range));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let upserts = 0;
  for (const r of records) {
    const id = normalizeEmail(r.email);
    await prisma.lrm.upsert({
      where: { id },
      create: { id, email: id, name: nameFromEmail(id), tl: r.owner ?? undefined },
      update: { tl: r.owner ?? undefined },
    });
    await prisma.lrmDailyMetric.upsert({
      where: { lrmId_date: { lrmId: id, date: today } },
      create: {
        // `ach` (cycle-to-date MD+DD) isn't a column here — LrmDailyMetric stores
        // the per-day `mdDd`, and lib/aggregate.ts sums it across the cycle.
        // mdDd stays 0 until a per-day MD+DD source is wired in (see lib/metabase.ts).
        lrmId: id, date: today,
        target: r.target ?? undefined,
        oal: r.oal ?? undefined, cal: r.cal ?? undefined,
        leadScore: r.leadScore ?? undefined, productiveHrs: r.productiveHrs ?? undefined,
        mdDd: 0,
      },
      update: {
        target: r.target ?? undefined, oal: r.oal ?? undefined, cal: r.cal ?? undefined,
        leadScore: r.leadScore ?? undefined, productiveHrs: r.productiveHrs ?? undefined,
      },
    });
    upserts++;
  }

  return NextResponse.json({ ok: true, syncedAt: new Date().toISOString(), lrms: upserts });
}
