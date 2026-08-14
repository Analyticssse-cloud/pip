import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LRM Performance Improvement Tracker",
  description: "TL/ZSM cockpit for the presales LRM improvement process.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
