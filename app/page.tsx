// app/page.tsx — the tracker shell: auth guard, load the cluster roster +
// this cluster's app-owned state, hand it all to the client component.
// ARCHITECTURE.md §6.
import { redirect } from "next/navigation";
import TrackerShell from "@/components/TrackerShell";
import { auth } from "@/lib/auth";
import { buildRoster } from "@/lib/aggregate";
import { CLUSTER } from "@/lib/cluster";
import { prisma } from "@/lib/db";
import type { DecisionInfo } from "@/lib/derive";
import type { PlanModel } from "@/lib/metrics";

// The roster + this cluster's thresholds are read fresh on every request —
// never statically prerendered (the auth guard alone would make that
// meaningless).
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");

  const { entries, setting } = await buildRoster(CLUSTER);
  const cycleIds = entries.map((e) => e.cycleId);

  const [planItems, decisions] = cycleIds.length
    ? await Promise.all([
        prisma.planItemState.findMany({ where: { cycleId: { in: cycleIds } } }),
        prisma.cycleDecision.findMany({ where: { cycleId: { in: cycleIds } } }),
      ])
    : [[], []];

  const doneMap: Record<string, boolean> = {};
  for (const p of planItems) doneMap[`${p.cycleId}:${p.model}:${p.phase}:${p.itemKey}`] = p.done;

  const decisionMap: Record<string, DecisionInfo> = {};
  for (const d of decisions) {
    decisionMap[d.cycleId] = { outcome: d.outcome, note: d.note, decidedAt: d.decidedAt.toISOString() };
  }

  const tlLabel = entries.find((e) => e.metrics.tl && e.metrics.tl !== "—")?.metrics.tl ?? "—";

  return (
    <TrackerShell
      cluster={CLUSTER}
      tlLabel={tlLabel}
      entries={entries}
      setting={{ benchmark: setting.benchmark, tenureGuard: setting.tenureGuard, planModel: setting.planModel as PlanModel }}
      doneMap={doneMap}
      decisionMap={decisionMap}
    />
  );
}
