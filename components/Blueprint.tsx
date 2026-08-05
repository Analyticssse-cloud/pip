// components/Blueprint.tsx — the design system's square, hairline-bordered,
// corner-registration-marked card wrapper (docs/handoff/README.md
// "Design tokens" § the blueprint frame). Every card, KPI tile, and phase
// panel on the three screens uses this.
import type { CSSProperties, ReactNode } from "react";

export default function Blueprint({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={["blueprint", className].filter(Boolean).join(" ")} style={style}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {children}
    </div>
  );
}
