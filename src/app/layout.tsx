import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Trace | Research deserves a second run",
  description: "An evidence-first research agent. Read a paper, inspect its claims, and run a reproducible experiment in an isolated CreateOS sandbox.",
};

export const viewport: Viewport = { themeColor: "#0a0a0a", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark"><body>{children}</body></html>;
}
