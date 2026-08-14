"use client";
// components/views/LrmPlan.tsx — the measurable coaching plan for one LRM.
import Blueprint from "../Blueprint";
import { bandColors, fmtDate } from "../uiHelpers";
import {
  BARS, avgPerDay, bandOf, causeOf, phases, trajectoryOf,
  type LrmMetrics, type PlanModel, type Thresholds,
} from "@/lib/metrics";
import type { DecisionRecord } from "@/lib/data";

const DECISIONS: { key: string; label: string }[] = [
  { key: "exit", label: "Exit the watchlist" },
  { key: "continue", label: "Run one more cycle" },
  { key: "reallocate", label: "Change lead allocation" },
  { key: "pip", label: "Escalate to formal PIP" },
];

export default function LrmPlan({
  lrms, thresholds, selId, onSelect, model, onModel, role,
  done, note, decision, onToggle, onNote, onDecision,
}: {
  lrms: LrmMetrics[];
  thresholds: Thresholds;
  selId: string;
  onSelect: (id: string) => void;
  model: PlanModel;
  onModel: (m: PlanModel) => void;
  role: "manager" | "lrm";
  done: Record<string, boolean>;
  note: string;
  decision: DecisionRecord | null;
  onToggle: (phase: string, itemKey: string) => void;
  onNote: (v: string) => void;
  onDecision: (outcome: string) => void;
}) {
  const sel = lrms.find(l => l.id === selId) ?? lrms[0];
  const canEdit = role === "manager";
  const cause = causeOf(sel);
  const band = bandOf(sel, thresholds);
  const bc = bandColors(band);
  const traj = trajectoryOf(sel);
  const avg = avgPerDay(sel, thresholds);
  const ph = phases(sel, thresholds, model);

  const doneKey = (phase: string, itemKey: string) => `${sel.id}:${model}:${phase}:${itemKey}`;
  const total = ph.reduce((s, p) => s + p.items.length, 0);
  const doneCount = ph.reduce((s, p) => s + p.items.filter(i => done[doneKey(p.label, i.itemKey)]).length, 0);

  const metricCards = [
    { label: "MD+DD / day", val: avg.toFixed(1), bar: thresholds.benchmark, cur: avg, unit: "" },
    { label: "Live leads", val: String(sel.cal), bar: BARS.CAL, cur: sel.cal, unit: "" },
    { label: "Productive hrs", val: sel.prod.toFixed(1), bar: BARS.PROD, cur: sel.prod, unit: "h" },
    { label: "BQL → MD", val: `${sel.conv}%`, bar: BARS.CONV, cur: sel.conv, unit: "%" },
  ];
  const maxWeek = Math.max(thresholds.benchmark, ...sel.weeks) * 1.15;

  const tracked = lrms.filter(l => avgPerDay(l, thresholds) < thresholds.benchmark || l.cal === 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 28, alignItems: "start" }}>
      {/* ── Sidebar ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", position: "sticky", top: 20 }}>
        <Blueprint style={{ padding: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{sel.name}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>{sel.email}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
            <span className="tag" style={{ background: bc.bg, color: bc.fg, border: bc.border ? `1px solid ${bc.border}` : undefined }}>{band}</span>
            <span className="tag tag-outline">{traj}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 13 }}>
            <span className="text-muted">City</span><span>{sel.city}</span>
            <span className="text-muted">TL</span><span>{sel.tl}</span>
            <span className="text-muted">ZSM</span><span>{sel.zsm}</span>
            <span className="text-muted">Tenure</span><span>{sel.tenureDays} days</span>
            <span className="text-muted">Cycle</span><span>{sel.ach} of {sel.target || "—"} MD+DD</span>
          </div>
        </Blueprint>

        {canEdit && (
          <Blueprint style={{ padding: "var(--space-3)" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)", margin: "2px 4px 8px" }}>Switch LRM</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {tracked.map(l => {
                const on = l.id === sel.id;
                return (
                  <button key={l.id} onClick={() => onSelect(l.id)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 10px", cursor: "pointer", border: 0, textAlign: "left", font: "inherit",
                      background: on ? "var(--color-accent)" : "transparent",
                      color: on ? "var(--color-bg)" : "var(--color-text)",
                    }}>
                    <span style={{ fontSize: 13 }}>{l.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{avgPerDay(l, thresholds).toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          </Blueprint>
        )}
      </div>

      {/* ── Main ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {/* The one thing to fix */}
        <div style={{ position: "relative", background: "var(--color-accent-900)", color: "var(--color-bg)", padding: "var(--space-6)", border: "1px solid var(--color-accent-900)" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7 }}>The one thing to fix</div>
          <h3 style={{ margin: "6px 0 10px", color: "var(--color-bg)" }}>{cause.title}</h3>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.85, maxWidth: 720 }}>{cause.body}</p>
        </div>

        {/* Where they stand against the bar */}
        <div>
          <h5 style={{ marginBottom: "var(--space-3)" }}>Where they stand against the bar</h5>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {metricCards.map(m => {
              const ok = m.cur >= m.bar;
              return (
                <Blueprint key={m.label} style={{ padding: "var(--space-3)" }}>
                  <div className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>{m.val}</div>
                  <div style={{ height: 5, background: "var(--color-neutral-200)" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (m.cur / m.bar) * 100)}%`, background: ok ? "var(--color-accent-700)" : "var(--color-accent)" }} />
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: ok ? "var(--color-accent-700)" : "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                    {ok ? "at the bar" : `bar ${m.bar}${m.unit}`}
                  </div>
                </Blueprint>
              );
            })}
          </div>
        </div>

        {/* Four weeks of daily output */}
        <div>
          <h5 style={{ marginBottom: "var(--space-3)" }}>Four weeks of daily output</h5>
          <Blueprint style={{ padding: "var(--space-4)" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 20, height: 150 }}>
              {/* benchmark line */}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(thresholds.benchmark / maxWeek) * 130}px`, borderTop: "1px dashed var(--color-accent-700)" }}>
                <span style={{ position: "absolute", right: 0, top: -16, fontSize: 10, color: "var(--color-accent-700)" }}>benchmark {thresholds.benchmark}</span>
              </div>
              {sel.weeks.map((w, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 1 }}>
                  <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{w.toFixed(1)}</span>
                  <div style={{ width: "100%", maxWidth: 70, height: `${(w / maxWeek) * 130}px`, minHeight: 2, background: i === 3 ? "var(--color-accent)" : "var(--color-accent-300)" }} />
                  <span className="text-muted" style={{ fontSize: 11 }}>Week {i + 1}</span>
                </div>
              ))}
            </div>
          </Blueprint>
        </div>

        {/* The plan */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)", gap: 16, flexWrap: "wrap" }}>
            <h5 style={{ margin: 0 }}>The plan</h5>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="text-muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{doneCount} of {total} done</span>
              <div className="seg">
                <button className={`seg-opt${model === "sprint" ? " is-on" : ""}`} onClick={() => onModel("sprint")}>30-day sprint</button>
                <button className={`seg-opt${model === "coach" ? " is-on" : ""}`} onClick={() => onModel("coach")}>Coaching track</button>
              </div>
            </div>
          </div>
          <div style={{ height: 4, background: "var(--color-neutral-200)", marginBottom: "var(--space-4)" }}>
            <div style={{ height: "100%", width: `${total ? (doneCount / total) * 100 : 0}%`, background: "var(--color-accent)" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {ph.map(p => (
              <Blueprint key={p.label} style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>{p.label}</span>
                  <span className="tag tag-accent">{p.gate}</span>
                </div>
                <div style={{ fontSize: 12 }}>
                  <div className="text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>Exit</div>
                  <div>{p.exit}</div>
                  <div style={{ marginTop: 6, color: p.gateOk == null ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : p.gateOk ? "var(--color-accent-700)" : "var(--color-accent-900)" }}>
                    Now — {p.gateNow}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
                  {p.items.map(it => {
                    const k = doneKey(p.label, it.itemKey);
                    const isDone = !!done[k];
                    return (
                      <label key={it.itemKey} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 10, cursor: canEdit ? "pointer" : "default", alignItems: "start" }}>
                        <input type="checkbox" checked={isDone} disabled={!canEdit}
                          onChange={() => onToggle(p.label, it.itemKey)}
                          style={{ width: 16, height: 16, marginTop: 3, accentColor: "var(--color-accent)" }} />
                        <div>
                          <div style={{ fontSize: 13, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.55 : 1 }}>{it.text}</div>
                          <div style={{ fontSize: 11.5, marginTop: 3, display: "grid", gap: 1 }}>
                            <span><b style={{ fontWeight: 700 }}>Target</b> · {it.target}</span>
                            <span style={{ color: it.nowOk == null ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : it.nowOk ? "var(--color-accent-700)" : "var(--color-accent-900)" }}><b style={{ fontWeight: 700 }}>Now</b> · {it.now}</span>
                            <span className="text-muted"><b style={{ fontWeight: 700 }}>Measured</b> · {it.source}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="text-muted" style={{ fontSize: 11, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
                  Owner {p.owner} · Evidence {p.evidence}
                </div>
              </Blueprint>
            ))}
          </div>
        </div>

        {/* Close the cycle */}
        <div>
          <h5 style={{ marginBottom: "var(--space-3)" }}>Close the cycle</h5>
          <Blueprint style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <label style={{ fontSize: 12 }} className="text-muted">Coaching note</label>
            <textarea className="input" value={note} disabled={!canEdit}
              placeholder={canEdit ? "What did we agree with this LRM?" : "No note recorded yet."}
              onChange={e => onNote(e.target.value)} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {DECISIONS.map(d => {
                const on = decision?.outcome === d.key;
                return (
                  <button key={d.key} disabled={!canEdit} onClick={() => onDecision(d.key)}
                    className={`btn ${on ? "btn-primary" : "btn-secondary"} btn-block`}>{d.label}</button>
                );
              })}
            </div>
            {decision && (
              <div className="text-muted" style={{ fontSize: 12 }}>
                Decision: <b>{DECISIONS.find(d => d.key === decision.outcome)?.label}</b> · recorded {fmtDate(decision.decidedAt)}
              </div>
            )}
          </Blueprint>
        </div>
      </div>
    </div>
  );
}
