"use client";
// components/views/Trend.tsx — is the intervention landing across the watchlist.
import Blueprint from "../Blueprint";
import { deltaBits } from "../uiHelpers";
import { avgPerDay, trajectoryOf, type LrmMetrics, type Thresholds } from "@/lib/metrics";

export default function Trend({ lrms, thresholds }: { lrms: LrmMetrics[]; thresholds: Thresholds }) {
  const tracked = lrms
    .filter(l => avgPerDay(l, thresholds) < thresholds.benchmark || l.cal === 0)
    .map(l => ({ l, traj: trajectoryOf(l), d: l.weeks[3] - l.weeks[0] }))
    .sort((a, b) => b.d - a.d);

  const counts = {
    Improving: tracked.filter(t => t.traj === "Improving").length,
    Flat: tracked.filter(t => t.traj === "Flat").length,
    Sliding: tracked.filter(t => t.traj === "Sliding" || t.traj === "Blocked").length,
  };
  const maxWeek = Math.max(1, ...tracked.flatMap(t => t.l.weeks));

  const kpis = [
    { k: "Improving", v: counts.Improving, s: "Δ ≥ +0.5 / day" },
    { k: "Flat", v: counts.Flat, s: "within ±0.5" },
    { k: "Sliding", v: counts.Sliding, s: "Δ ≤ −0.5 / day" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {kpis.map(c => (
          <Blueprint key={c.k} style={{ padding: "var(--space-4)" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{c.k}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 40, lineHeight: 1, margin: "8px 0 4px", fontVariantNumeric: "tabular-nums" }}>{c.v}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>{c.s}</div>
          </Blueprint>
        ))}
      </div>

      <Blueprint style={{ padding: "var(--space-3) var(--space-4)" }}>
        <table className="table">
          <thead>
            <tr>
              <th>LRM</th>
              <th style={{ width: 260 }}>Weekly MD+DD / day</th>
              <th style={{ textAlign: "right" }}>Change</th>
              <th>Trajectory</th>
            </tr>
          </thead>
          <tbody>
            {tracked.map(t => {
              const db = deltaBits(t.d);
              const blocked = t.traj === "Blocked";
              return (
                <tr key={t.l.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{t.l.name}</div>
                    <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{t.l.email}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 44 }}>
                      {t.l.weeks.map((w, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ width: "100%", height: `${(w / maxWeek) * 34}px`, minHeight: 2, background: i === 3 ? "var(--color-accent)" : "var(--color-accent-300)" }} />
                          <span style={{ fontSize: 9, color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>{`W${i + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: db.fg }}>{blocked ? "—" : db.label}</td>
                  <td>
                    <span className="tag" style={{
                      background: t.traj === "Improving" ? "var(--color-accent-200)" : t.traj === "Sliding" ? "var(--color-accent-900)" : "var(--color-neutral-100)",
                      color: t.traj === "Sliding" ? "var(--color-bg)" : t.traj === "Improving" ? "var(--color-accent-900)" : "var(--color-neutral-800)",
                      border: blocked ? "1px solid var(--color-accent)" : undefined,
                    }}>{t.traj}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Blueprint>
      <p className="text-muted" style={{ fontSize: 12 }}>Direction over level — Week 4 vs Week 1 average. Zero-lead LRMs read as blocked, not sliding.</p>
    </div>
  );
}
