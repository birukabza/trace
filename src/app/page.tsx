import { ResearchWorkspace } from "@/components/research-workspace";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function Home({ searchParams }: { searchParams: Promise<{ run?: string | string[] }> }) {
  const parameters = await searchParams;
  const initialRunId = typeof parameters.run === "string" ? parameters.run : undefined;
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/login${initialRunId ? `?next=${encodeURIComponent(`/?run=${encodeURIComponent(initialRunId)}`)}` : ""}`);
  return <ResearchWorkspace initialRunId={initialRunId} user={user} />;
}
