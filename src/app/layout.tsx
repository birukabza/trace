import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";
import "./demo.css";
import "./agent-workbench.css";
import "./result-view.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "Trace | Research deserves a second run",
  description: "A research agent that reads a paper, writes and runs a focused experiment, and repairs its code using real sandbox feedback.",
};

export const viewport: Viewport = { themeColor: "#0a0a0a", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark"><body>{children}</body></html>;
}
