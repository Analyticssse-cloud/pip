"use server";
// app/actions.ts — the write path. Server Actions that persist shared human-state to Postgres
// and revalidate the page. Manager-only, enforced server-side (not just disabled in the UI).
// No-ops safely when there is no database (sample mode).
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { loadCluster } from "@/lib/data";
import { normalizeEmail } from "@/lib/session";

// A caller is a manager iff their email is NOT one of the roster LRMs.
async function assertManager(email: string): Promise<boolean> {
  const { lrms } = await loadCluster();
  const norm = normalizeEmail(email);
  return !lrms.some(l => normalizeEmail(l.email) === norm);
}

async function upsertUser(email: string) {
  if (!prisma) return null;
  const norm = normalizeEmail(email);
  return prisma.appUser.upsert({
    where: { email: norm },
    create: { email: norm, role: "TL" },
    update: {},
  });
}

// Find (or open) the current cycle for an LRM so plan-item / decision writes have a parent.
async function currentCycle(lrmId: string) {
  if (!prisma) return null;
  const open = await prisma.cycle.findFirst({ where: { lrmId, status: "open" } });
  if (open) return open;
  const setting = await prisma.clusterSetting.findFirst();
  const now = new Date();
  return prisma.cycle.create({
    data: {
      lrmId,
      startDate: now,
      endDate: new Date(now.getTime() + 30 * 864e5),
      workingDays: 26,
      benchmark: setting?.benchmark ?? 4,
      tenureGuard: setting?.tenureGuard ?? 60,
      planModel: setting?.planModel ?? "sprint",
      status: "open",
    },
  });
}

export async function savePlanItem(input: {
  lrmId: string; model: string; phase: string; itemKey: string; done: boolean; email: string;
}) {
  if (!prisma) return;
  if (!(await assertManager(input.email))) return;
  const user = await upsertUser(input.email);
  const cycle = await currentCycle(input.lrmId);
  if (!cycle) return;
  await prisma.planItemState.upsert({
    where: { cycleId_model_phase_itemKey: { cycleId: cycle.id, model: input.model, phase: input.phase, itemKey: input.itemKey } },
    create: { cycleId: cycle.id, model: input.model, phase: input.phase, itemKey: input.itemKey, done: input.done, doneById: user?.id, doneAt: new Date() },
    update: { done: input.done, doneById: user?.id, doneAt: new Date() },
  });
  revalidatePath("/");
}

export async function saveCycleDecision(input: {
  lrmId: string; outcome: string; note: string; email: string;
}) {
  if (!prisma) return;
  if (!(await assertManager(input.email))) return;
  const user = await upsertUser(input.email);
  const cycle = await currentCycle(input.lrmId);
  if (!cycle || !user) return;
  await prisma.cycleDecision.upsert({
    where: { cycleId: cycle.id },
    create: { cycleId: cycle.id, outcome: input.outcome, note: input.note, decidedById: user.id },
    update: { outcome: input.outcome, note: input.note, decidedById: user.id, decidedAt: new Date() },
  });
  revalidatePath("/");
}
