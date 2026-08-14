// components/Blueprint.tsx — the wireframe frame every card/figure wears:
// square, hairline-bordered, with a "+" registration mark in each corner.
import type { CSSProperties, ReactNode } from "react";

export default function Blueprint({
  children, style, className, as: Tag = "div",
}: {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={`blueprint${className ? " " + className : ""}`} style={style}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {children}
    </Tag>
  );
}
