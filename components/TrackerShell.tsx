"use client";

// components/TrackerShell.tsx — the tracker's top bar + the three
// switchable views. This is the client-side equivalent of the prototype's
// Component class: it owns the ephemeral UI state (view, filter, selId,
// plan-model override — DATA_MODEL.md "State management") and the
// optimistic overlay for the two writes (plan-item checkbox, cycle
// decision), both of which persist to Postgres via the API routes and
// are shared across the team.
import { useMemo, useState } from "react";
import LrmPlan from "@/app/views/LrmPlan";
import Trend from "@/app/views/Trend";
import Watchlist from "@/app/views/Watchlist";
import { type DecisionInfo, type Entry, enrichAll, planItemKey, trackedOf } from "@/lib/derive";
import type { PlanModel } from "@/lib/metrics";

type View = "roster" | "plan" | "trend";
type Outcome = "exit" | "continue" | "reallocate" | "pip";

export interface ClusterSetting {
  benchmark: number;
  tenureGuard: number;
  planModel: PlanModel;
}

export default function TrackerShell({
  cluster,
  tlLabel,
  entries,
  setting,
  doneMap: initialDone,
  decisionMap: initialDecisions,
}: {
  cluster: string;
  tlLabel: string;
  entries: Entry[];
  setting: ClusterSetting;
  doneMap: Record<string, boolean>;
  decisionMap: Record<string, DecisionInfo>;
}) {
  const all = useMemo(() => enrichAll(entries), [entries]);
  const tracked = useMemo(() => trackedOf(all, setting.benchmark), [all, setting.benchmark]);

  const [view, setView] = useState<View>("roster");
  const [filter, setFilter] = useState<"watch" | "all">("watch");
  const [modelOverride, setModelOverride] = useState<PlanModel | null>(null);
  const [selId, setSelId] = useState<string>(tracked[0]?.metrics.id ?? all[0]?.metrics.id ?? "");
  const [doneMap, setDoneMap] = useState(initialDone);
  const [decisionMap, setDecisionMap] = useState(initialDecisions);
  const [note, setNote] = useState("");

  const sel = all.find((l) => l.metrics.id === selId) ?? tracked[0] ?? all[0];
  const model = modelOverride ?? setting.planModel;

  function openPlan(id: string) {
    setSelId(id);
    setView("plan");
  }

  async function toggleItem(cycleId: string, phase: string, itemKey: string) {
    const key = planItemKey(cycleId, model, phase, itemKey);
    const nextDone = !doneMap[key];
    setDoneMap((prev) => ({ ...prev, [key]: nextDone }));
    try {
      const res = await fetch("/api/plan-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, model, phase, itemKey, done: nextDone }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setDoneMap((prev) => ({ ...prev, [key]: !nextDone })); // revert on failure
    }
  }

  async function decide(outcome: Outcome) {
    if (!sel) return;
    const decidedAt = new Date().toISOString();
    const cycleId = sel.cycleId;
    const prevDecision = decisionMap[cycleId];
    setDecisionMap((prev) => ({ ...prev, [cycleId]: { outcome, note, decidedAt } }));
    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, outcome, note }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setDecisionMap((prev) => {
        const next = { ...prev };
        if (prevDecision) next[cycleId] = prevDecision;
        else delete next[cycleId];
        return next;
      });
    }
  }

  const tab = (name: View) => ({
    background: view === name ? "var(--color-accent)" : "transparent",
    color: view === name ? "var(--color-bg)" : "var(--color-text)",
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", paddingBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 32px", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em", marginRight: "auto" }}>
          LRM Performance Improvement Tracker
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-body)",
              fontWeight: 400,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
              marginTop: 2,
            }}
          >
            {cluster} Cluster · TL {tlLabel} · Daily refresh from Metabase
          </span>
        </div>
        <div style={{ display: "flex", gap: 2, border: "1px solid var(--color-divider)" }}>
          <button className="btn" style={{ border: 0, ...tab("roster") }} onClick={() => setView("roster")}>
            Watchlist
          </button>
          <button
            className="btn"
            style={{ border: 0, borderLeft: "1px solid var(--color-divider)", ...tab("plan") }}
            onClick={() => setView("plan")}
          >
            LRM plan
          </button>
          <button
            className="btn"
            style={{ border: 0, borderLeft: "1px solid var(--color-divider)", ...tab("trend") }}
            onClick={() => setView("trend")}
          >
            Trend
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
            textAlign: "right",
            lineHeight: 1.4,
          }}
        >
          {sel ? `Day ${sel.daysElapsed ?? sel.thresholds.workingDays} of ${sel.thresholds.workingDays}` : "No cycle"} · D-1 data
        </div>
      </div>

      {view === "roster" && (
        <Watchlist all={all} tracked={tracked} setting={setting} filter={filter} onFilterChange={setFilter} onOpenPlan={openPlan} />
      )}
      {view === "plan" && sel && (
        <LrmPlan
          sel={sel}
          tracked={tracked}
          model={model}
          onSelect={setSelId}
          onModelChange={setModelOverride}
          doneMap={doneMap}
          onToggleItem={toggleItem}
          note={note}
          onNoteChange={setNote}
          decision={decisionMap[sel.cycleId]}
          onDecide={decide}
        />
      )}
      {view === "trend" && <Trend tracked={tracked} />}
      {!sel && (
        <div style={{ padding: 32, fontSize: 14, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
          No LRMs synced for {cluster} yet — run <code>/api/sync</code> to seed the roster.
        </div>
      )}
    </div>
  );
}
