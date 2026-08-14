"use client";
// components/views/Watchlist.tsx — the TL's morning triage.
import Blueprint from "../Blueprint";
import { bandColors, deltaBits } from "../uiHelpers";
import { avgPerDay, bandOf, causeOf, type Band, type LrmMetrics, type Thresholds } from "@/lib/metrics";

const BUCKETS: { label: string; lo: number; hi: number; action: string }[] = [
  { label: "≥ 10",  lo: 10,  hi: Infinity, action: "No action" },
  { label: "7 – 10", lo: 7,  hi: 10,       action: "Observe" },
  { label: "4 – 7",  lo: 4,  hi: 7,        action: "Train" },
  { label: "2 – 4",  lo: 2,  hi: 4,        action: "Train" },
  { label: "0 – 2",  lo: 0.0001, hi: 2,    action: "PIP / exit" },
  { label: "0",      lo: -1, hi: 0.0001,   action: "Fix allocation" },
];

export default function Watchlist({
  lrms, thresholds, filter, onFilter, onOpen,
}: {
  lrms: LrmMetrics[];
  thresholds: Thresholds;
  filter: "watch" | "all";
  onFilter: (f: "watch" | "all") => void;
  onOpen: (id: string) => void;
}) {
  const rows = lrms.map(l => {
    const avg = avgPerDay(l, thresholds);
    return {
      l, avg,
      band: bandOf(l, thresholds) as Band,
      delta: l.weeks[3] - l.weeks[2],
      cause: causeOf(l),
      pct: l.target ? Math.round((l.ach / l.target) * 100) : null,
    };
  });
  const tracked = rows.filter(r => r.avg < thresholds.benchmark || r.l.cal === 0);
  const shown = (filter === "watch" ? tracked : rows).slice().sort((a, b) => a.avg - b.avg);

  const teamAvg = rows.reduce((s, r) => s + r.avg, 0) / (rows.length || 1);
  const movingUp = rows.filter(r => r.l.weeks[3] - r.l.weeks[0] >= 0.5).length;
  const needsDecision = tracked.filter(r => r.avg < thresholds.benchmark * 0.6).length;

  const kpis = [
    { k: "On the tracker", v: String(tracked.length), s: `of ${rows.length} in cluster` },
    { k: "Team average", v: teamAvg.toFixed(1), s: "MD+DD / day" },
    { k: "Moving up", v: String(movingUp), s: "improving week-on-week" },
    { k: "Needs a decision", v: String(needsDecision), s: "at / near cycle end" },
  ];

  const buckets = BUCKETS.map(b => {
    const list = rows.filter(r => (r.l.cal === 0 ? b.label === "0" : r.avg >= b.lo && r.avg < b.hi));
    return { ...b, count: list.length };
  });
  const maxBucket = Math.max(1, ...buckets.map(b => b.count));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {kpis.map(c => (
          <Blueprint key={c.k} style={{ padding: "var(--space-4)" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{c.k}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 40, lineHeight: 1, margin: "8px 0 4px", fontVariantNumeric: "tabular-nums" }}>{c.v}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>{c.s}</div>
          </Blueprint>
        ))}
      </div>

      {/* Band buckets */}
      <div>
        <h5 style={{ marginBottom: "var(--space-3)" }}>Where the team sits</h5>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {buckets.map(b => {
            const c = bandColors(b.action as Band);
            return (
              <Blueprint key={b.label} style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: 8, minHeight: 118 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>{b.label}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{b.count}</span>
                </div>
                <div style={{ height: 6, background: "var(--color-neutral-200)" }}>
                  <div style={{ height: "100%", width: `${(b.count / maxBucket) * 100}%`, background: "var(--color-accent)" }} />
                </div>
                <span className="tag" style={{ background: c.bg, color: c.fg, border: c.border ? `1px solid ${c.border}` : undefined, alignSelf: "flex-start", marginTop: "auto" }}>{b.action}</span>
              </Blueprint>
            );
          })}
        </div>
      </div>

      {/* Roster table */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <h5 style={{ margin: 0 }}>Roster</h5>
          <div className="seg">
            <button className={`seg-opt${filter === "watch" ? " is-on" : ""}`} onClick={() => onFilter("watch")}>On the tracker</button>
            <button className={`seg-opt${filter === "all" ? " is-on" : ""}`} onClick={() => onFilter("all")}>Full team</button>
          </div>
        </div>
        <Blueprint style={{ padding: "var(--space-3) var(--space-4)" }}>
          <table className="table">
            <thead>
              <tr>
                <th>LRM</th><th>Tenure</th><th style={{ textAlign: "right" }}>Target</th>
                <th style={{ textAlign: "right" }}>Achieved</th><th style={{ textAlign: "right" }}>MD+DD / day</th>
                <th style={{ textAlign: "right" }}>Wk Δ</th><th style={{ textAlign: "right" }}>Live leads</th>
                <th>What is holding them back</th><th>Action</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const c = bandColors(r.band);
                const db = deltaBits(r.delta);
                return (
                  <tr key={r.l.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.l.name}</div>
                      <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{r.l.email}</div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.l.tenureDays} days</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.l.target || "—"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.l.ach}{" "}
                      <span className="text-muted" style={{ fontSize: 12 }}>{r.pct != null ? `${r.pct}%` : ""}</span>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{r.avg.toFixed(1)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: db.fg }}>{db.label}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.l.cal}</td>
                    <td style={{ maxWidth: 220, fontSize: 13 }} className="text-muted">{r.cause.short}</td>
                    <td>
                      <span className="tag" style={{ background: c.bg, color: c.fg, border: c.border ? `1px solid ${c.border}` : undefined }}>{r.band}</span>
                    </td>
                    <td><button className="btn btn-ghost" onClick={() => onOpen(r.l.id)}>Open plan →</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Blueprint>
        <p className="text-muted" style={{ fontSize: 12, marginTop: "var(--space-3)" }}>
          Banding rule: ≥10 no action · 7–10 observe · 4–7 &amp; 2–4 train · &lt;2 PIP / exit unless tenure &lt; {thresholds.tenureGuard} days · zero live leads → fix allocation.
        </p>
      </div>
    </div>
  );
}
