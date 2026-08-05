import type { CSSProperties, ReactNode } from "react";

export default function Tag({
  bg,
  fg,
  children,
  className,
  style,
}: {
  bg?: string;
  fg?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const merged: CSSProperties = { ...style };
  if (bg) merged.background = bg;
  if (fg) merged.color = fg;
  return (
    <span className={["tag", className].filter(Boolean).join(" ")} style={merged}>
      {children}
    </span>
  );
}
