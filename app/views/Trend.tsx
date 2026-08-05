// app/views/Trend.tsx — screen 3, "trend": is the intervention landing.
// docs/handoff/README.md § Trend (trend).
import Blueprint from "@/components/Blueprint";
import Tag from "@/components/Tag";
import { type Enriched, trendRowsOf } from "@/lib/derive";

export default function Trend({ tracked }: { tracked: Enriched[] }) {
  const rows = trendRowsOf(tracked);
  const improving = tracked.filter((l) => l.trajectory === "Improving").length;
  const flat = tracked.filter((l) => l.trajectory === "Flat" || l.trajectory === "Blocked").length;
  const sliding = tracked.filter((l) => l.trajectory === "Sliding").length;

  const kpis = [
    { label: "Improving", value: improving, note: "week 4 above week 1 by 0.5+" },
    { label: "Flat", value: flat, note: "no movement — plan is not landing" },
    { label: "Sliding", value: sliding, note: "going backwards inside the sprint" },
  ];

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h4 style={{ margin: "0 0 4px" }}>Is the plan working?</h4>
        <p style={{ margin: 0, fontSize: 13, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", maxWidth: "80ch" }}>
          Weekly average MD+DD per day for everyone on the tracker, across the 30-day sprint. Direction matters more
          than level — a 1.9 climbing from 0.9 is a plan that is landing; a 3.1 sliding from 3.6 is not.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
        {kpis.map((k) => (
          <Blueprint key={k.label} style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)" }}>
              {k.label}
            </div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 40, lineHeight: 1, marginTop: 6 }}>
              {k.value}
            </div>
            <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", marginTop: 4 }}>
              {k.note}
            </div>
          </Blueprint>
        ))}
      </div>
      <Blueprint style={{ padding: "18px 20px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px repeat(4,1fr) 130px 150px",
            gap: "0 16px",
            alignItems: "center",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
            paddingBottom: 10,
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          <div>LRM</div>
          <div>Week 1</div>
          <div>Week 2</div>
          <div>Week 3</div>
          <div>Week 4</div>
          <div>Change</div>
          <div>Read</div>
        </div>
        {rows.map((t) => (
          <div
            key={t.name}
            style={{
              display: "grid",
              gridTemplateColumns: "200px repeat(4,1fr) 130px 150px",
              gap: "0 16px",
              alignItems: "center",
              padding: "12px 0",
              borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{t.band}</div>
            </div>
            {t.cells.map((c, i) => (
              <div key={i}>
                <div style={{ height: 22, background: "var(--color-neutral-200)", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: c.w, background: c.color }} />
                  <div style={{ position: "absolute", left: 8, top: 2, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    {c.val}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", color: t.deltaFg }}>{t.delta}</div>
            <div>
              <Tag bg={t.tagBg} fg={t.tagFg}>
                {t.trajectory}
              </Tag>
            </div>
          </div>
        ))}
      </Blueprint>
    </div>
  );
}
