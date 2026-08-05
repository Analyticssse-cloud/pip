// app/views/Watchlist.tsx — screen 1, "roster": the TL's morning triage.
// docs/handoff/README.md § Watchlist (roster).
import BarChart from "@/components/BarChart";
import Blueprint from "@/components/Blueprint";
import KpiCard from "@/components/KpiCard";
import SegControl from "@/components/SegControl";
import Tag from "@/components/Tag";
import { BAND_STYLE, type Enriched, bucketsOf, deltaBits } from "@/lib/derive";

export default function Watchlist({
  all,
  tracked,
  setting,
  filter,
  onFilterChange,
  onOpenPlan,
}: {
  all: Enriched[];
  tracked: Enriched[];
  setting: { benchmark: number; tenureGuard: number };
  filter: "watch" | "all";
  onFilterChange: (f: "watch" | "all") => void;
  onOpenPlan: (id: string) => void;
}) {
  const buckets = bucketsOf(all);
  const rows = filter === "watch" ? tracked : all;
  const avgAll = all.length ? all.reduce((n, l) => n + l.avg, 0) / all.length : 0;
  const improving = tracked.filter((l) => l.trajectory === "Improving").length;

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
        <KpiCard
          kicker="On the tracker"
          value={String(tracked.length)}
          note={`of ${all.length} LRMs below ${setting.benchmark} MD+DD/day`}
        />
        <KpiCard
          kicker="Team average"
          value={avgAll.toFixed(1)}
          note={`MD+DD per day · benchmark ${setting.benchmark.toFixed(1)}`}
        />
        <KpiCard kicker="Moving up" value={String(improving)} note="tracked LRMs improved week on week" />
        <KpiCard kicker="Needs a decision" value={String(tracked.length)} note="sprint day reached — close the loop" />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <h4 style={{ margin: 0 }}>Where the team sits</h4>
          <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            MD+DD per working day · the band decides the action, tenure under {setting.tenureGuard} days is coached
            not PIP&apos;d
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 20 }}>
          {buckets.map((b) => (
            <Blueprint key={b.label} style={{ padding: "14px 14px 12px" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.04em", color: "color-mix(in srgb, var(--color-text) 65%, transparent)" }}>
                {b.label}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 8 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 32, lineHeight: 1 }}>
                  {b.count}
                </div>
                <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", paddingBottom: 5 }}>
                  LRMs
                </div>
              </div>
              <div style={{ margin: "10px 0" }}>
                <BarChart width={b.w} />
              </div>
              <Tag bg={b.bg} fg={b.fg}>
                {b.action}
              </Tag>
            </Blueprint>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Roster</h4>
          <div style={{ marginLeft: "auto" }}>
            <SegControl
              name="rosterfilter"
              value={filter}
              onChange={onFilterChange}
              options={[
                { value: "watch", label: "On the tracker" },
                { value: "all", label: "Full team" },
              ]}
            />
          </div>
        </div>
        <Blueprint style={{ padding: "8px 14px 14px" }}>
          <table className="table">
            <thead>
              <tr>
                <th>LRM</th>
                <th>Tenure</th>
                <th style={{ textAlign: "right" }}>Target</th>
                <th style={{ textAlign: "right" }}>Achieved</th>
                <th style={{ textAlign: "right" }}>MD+DD / day</th>
                <th style={{ textAlign: "right" }}>Wk on wk</th>
                <th style={{ textAlign: "right" }}>Live leads</th>
                <th style={{ textAlign: "right" }}>BQL&gt;MD</th>
                <th style={{ textAlign: "right" }}>Prod. hrs</th>
                <th>What is holding them back</th>
                <th>Action</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const db = deltaBits(r.delta);
                const st = BAND_STYLE[r.band];
                return (
                  <tr key={r.metrics.id}>
                    <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16 }}>
                        {r.metrics.name}
                      </div>
                      <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                        {r.metrics.email}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.metrics.tenureDays} days</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.metrics.target || "—"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.metrics.ach}{" "}
                      <span style={{ color: "color-mix(in srgb, var(--color-text) 45%, transparent)", fontSize: 12 }}>
                        {r.metrics.target ? Math.round((r.metrics.ach / r.metrics.target) * 100) + "%" : "—"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {r.avg.toFixed(1)}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: db.fg }}>{db.label}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.metrics.cal}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.metrics.conv ? r.metrics.conv + "%" : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.metrics.prod ? r.metrics.prod.toFixed(1) + "h" : "—"}
                    </td>
                    <td style={{ fontSize: 13, maxWidth: 250 }}>{r.cause.short}</td>
                    <td>
                      <Tag bg={st.bg} fg={st.fg}>
                        {r.band}
                      </Tag>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => onOpenPlan(r.metrics.id)}
                      >
                        Open plan
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Blueprint>
        <div
          style={{
            fontSize: 12,
            color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
            marginTop: 10,
            maxWidth: 760,
          }}
        >
          Bands follow the standing rule: 7–10 MD+DD/day observe, 4–7 and 2–4 train, under 2 goes to PIP or exit.
          Anyone inside their first {setting.tenureGuard} days stays on training regardless of band, and an LRM with
          no live leads is an allocation fix, not a performance case.
        </div>
      </div>
    </div>
  );
}
