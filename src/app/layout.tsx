import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Trace | Research deserves a second run",
  description: "An evidence-first research agent. Read a paper, inspect its claims, and run a reproducible experiment in an isolated CreateOS sandbox.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
