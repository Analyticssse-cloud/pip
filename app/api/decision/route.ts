// app/api/decision/route.ts — "Close the cycle" decision + note. App-owned
// state (DATA_MODEL.md § CycleDecision); the sync job never touches this
// table. Exit/PIP close the cycle so the next plan-open starts a fresh one.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const OUTCOMES = new Set(["exit", "continue", "reallocate", "pip"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { cycleId, outcome, note } = body ?? {};
  if (typeof cycleId !== "string" || typeof outcome !== "string" || !OUTCOMES.has(outcome)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const user = await prisma.appUser.upsert({
    where: { email },
    update: { name: session.user?.name ?? undefined },
    create: { email, name: session.user?.name ?? undefined },
  });

  const decision = await prisma.cycleDecision.upsert({
    where: { cycleId },
    update: { outcome, note: note ?? null, decidedById: user.id, decidedAt: new Date() },
    create: { cycleId, outcome, note: note ?? null, decidedById: user.id },
  });

  if (outcome === "exit" || outcome === "pip") {
    await prisma.cycle.update({ where: { id: cycleId }, data: { status: "closed" } }).catch(() => null);
  }

  return NextResponse.json({ ok: true, decision });
}
