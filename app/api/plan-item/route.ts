// app/api/plan-item/route.ts — toggle one plan-item checkbox. App-owned,
// shared state (DATA_MODEL.md § PlanItemState); the sync job never touches
// this table.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { cycleId, model, phase, itemKey, done } = body ?? {};
  if (
    typeof cycleId !== "string" ||
    typeof model !== "string" ||
    typeof phase !== "string" ||
    typeof itemKey !== "string" ||
    typeof done !== "boolean"
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const user = await prisma.appUser.upsert({
    where: { email },
    update: { name: session.user?.name ?? undefined },
    create: { email, name: session.user?.name ?? undefined },
  });

  const state = await prisma.planItemState.upsert({
    where: { cycleId_model_phase_itemKey: { cycleId, model, phase, itemKey } },
    update: { done, doneById: user.id, doneAt: done ? new Date() : null },
    create: { cycleId, model, phase, itemKey, done, doneById: user.id, doneAt: done ? new Date() : null },
  });

  return NextResponse.json({ ok: true, state });
}
