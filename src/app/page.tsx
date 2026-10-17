import { ResearchWorkspace } from "@/components/research-workspace";

export default async function Home({ searchParams }: { searchParams: Promise<{ run?: string | string[] }> }) {
  const parameters = await searchParams;
  const initialRunId = typeof parameters.run === "string" ? parameters.run : undefined;
  return <ResearchWorkspace initialRunId={initialRunId} />;
}
