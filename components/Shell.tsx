"use client";
// components/Shell.tsx — the authenticated tracker shell: top bar, role gating, view switching,
// and the write path (checkbox / note / decision). Persists to Postgres via server actions when a
// DB is configured; mirrors to localStorage so the sample-data build works with no backend.
import { useEffect, useMemo, useState } from "react";
import Watchlist from "./views/Watchlist";
import LrmPlan from "./views/LrmPlan";
import Trend from "./views/Trend";
import { fmtTime } from "./uiHelpers";
import { savePlanItem, saveCycleDecision } from "@/app/actions";
import { avgPerDay, type LrmMetrics, type PlanModel, type Thresholds } from "@/lib/metrics";
import type { ClusterData, DecisionRecord } from "@/lib/data";
import type { AppSession, Role } from "@/lib/session";

const STORE_KEY = "lrmtracker:v1";
type View = "roster" | "plan" | "trend";

interface Persisted {
  done: Record<string, boolean>;
  notes: Record<string, string>;
  decisions: Record<string, DecisionRecord>;
}

export default function Shell({
  data, session, demo,
}: {
  data: ClusterData;
  session: AppSession;
  demo: boolean;
}) {
  const { lrms, thresholds } = data;

  // In demo mode the top-bar "Signed in as" switcher changes identity client-side.
  const [demoEmail, setDemoEmail] = useState(session.email);
  const active: AppSession = useMemo(() => {
    if (!demo) return session;
    const self = lrms.find(l => l.email === demoEmail);
    return self
      ? { email: self.email, name: self.name, role: "lrm" as Role, lrmId: self.id }
      : { email: demoEmail, name: "Team lead", role: "manager" as Role };
  }, [demo, demoEmail, session, lrms]);
  const role = active.role;
  const canEdit = role === "manager";

  const firstTracked = lrms.find(l => avgPerDay(l, thresholds) < thresholds.benchmark || l.cal === 0) ?? lrms[0];

  const [view, setView] = useState<View>(role === "lrm" ? "plan" : "roster");
  const [filter, setFilter] = useState<"watch" | "all">("watch");
  const [selId, setSelId] = useState<string>(active.lrmId ?? firstTracked.id);
  const [model, setModel] = useState<PlanModel>("sprint");
  const [store, setStore] = useState<Persisted>({ done: data.planState, notes: {}, decisions: data.decisions });

  // Lock an LRM to their own record whenever identity changes.
  useEffect(() => {
    if (role === "lrm" && active.lrmId) { setSelId(active.lrmId); setView("plan"); }
    else if (role === "manager" && view === "plan" && demo) { /* keep */ }
  }, [role, active.lrmId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sample mode: hydrate persisted human-state from localStorage.
  useEffect(() => {
    if (data.source === "db") return;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        setStore(s => ({ done: { ...s.done, ...p.done }, notes: { ...p.notes }, decisions: { ...p.decisions } }));
      }
    } catch { /* ignore */ }
  }, [data.source]);

  function persistLocal(next: Persisted) {
    setStore(next);
    if (data.source !== "db") {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  }

  function onToggle(phase: string, itemKey: string) {
    if (!canEdit) return;
    const k = `${selId}:${model}:${phase}:${itemKey}`;
    const value = !store.done[k];
    persistLocal({ ...store, done: { ...store.done, [k]: value } });
    if (data.source === "db") {
      savePlanItem({ lrmId: selId, model, phase, itemKey, done: value, email: active.email }).catch(() => {});
    }
  }

  function onNote(v: string) {
    if (!canEdit) return;
    persistLocal({ ...store, notes: { ...store.notes, [selId]: v } });
  }

  function onDecision(outcome: string) {
    if (!canEdit) return;
    const rec: DecisionRecord = { outcome, note: store.notes[selId] ?? "", decidedAt: new Date().toISOString() };
    persistLocal({ ...store, decisions: { ...store.decisions, [selId]: rec } });
    if (data.source === "db") {
      saveCycleDecision({ lrmId: selId, outcome, note: rec.note, email: active.email }).catch(() => {});
    }
  }

  const tabs: { k: View; label: string }[] = [
    { k: "roster", label: "Watchlist" },
    { k: "plan", label: "LRM plan" },
    { k: "trend", label: "Trend" },
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <header style={{ borderBottom: "1px solid var(--color-divider)", position: "sticky", top: 0, background: "var(--color-bg)", zIndex: 10 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>LRM Performance Improvement Tracker</div>
            <div className="text-muted" style={{ fontSize: 12 }}>Pune cluster · Akshay Shrivant</div>
          </div>

          {role === "manager" && (
            <nav style={{ display: "flex", gap: 4, marginLeft: 12 }}>
              {tabs.map(t => (
                <button key={t.k} onClick={() => setView(t.k)}
                  className="btn"
                  style={{
                    borderColor: view === t.k ? "var(--color-accent)" : "transparent",
                    background: view === t.k ? "var(--color-accent)" : "transparent",
                    color: view === t.k ? "var(--color-bg)" : "var(--color-text)",
                  }}>{t.label}</button>
              ))}
            </nav>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            <span className="text-muted" style={{ fontSize: 12, textAlign: "right" }}>
              Refreshed {fmtTime(data.fetchedAt)}<br />
              from {data.source === "db" ? "the Google Sheet" : "sample data"}
            </span>
            {demo ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="text-muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Signed in as (demo)</span>
                <select className="input" style={{ minHeight: 32, width: 200 }} value={demoEmail} onChange={e => setDemoEmail(e.target.value)}>
                  <option value={session.email}>Akshay Shrivant — TL</option>
                  {lrms.map(l => <option key={l.id} value={l.email}>{l.name} — LRM</option>)}
                </select>
              </label>
            ) : (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13 }}>{active.name}</div>
                <span className="tag tag-outline" style={{ fontSize: 10 }}>{role === "manager" ? "Manager" : "LRM · view only"}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px" }}>
        {role === "manager" && view === "roster" && (
          <Watchlist lrms={lrms} thresholds={thresholds} filter={filter} onFilter={setFilter}
            onOpen={(id) => { setSelId(id); setView("plan"); }} />
        )}
        {view === "plan" && (
          <LrmPlan
            lrms={lrms} thresholds={thresholds}
            selId={role === "lrm" ? (active.lrmId ?? selId) : selId}
            onSelect={setSelId} model={model} onModel={setModel} role={role}
            done={store.done}
            note={store.notes[role === "lrm" ? (active.lrmId ?? selId) : selId] ?? store.decisions[selId]?.note ?? ""}
            decision={store.decisions[role === "lrm" ? (active.lrmId ?? selId) : selId] ?? null}
            onToggle={onToggle} onNote={onNote} onDecision={onDecision} />
        )}
        {role === "manager" && view === "trend" && (
          <Trend lrms={lrms} thresholds={thresholds} />
        )}
      </main>
    </div>
  );
}
