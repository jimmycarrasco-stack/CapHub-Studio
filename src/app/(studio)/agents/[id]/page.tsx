import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAgent, listKnowledge } from "@/lib/repo";
import { getAiSettings } from "@/lib/settings";
import { AgentEditor } from "./agent-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: getAgent((await params).id)?.name ?? "Agent" };
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();

  const h = await headers();
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const ai = getAiSettings();

  return (
    <AgentEditor
      initialAgent={agent}
      initialKnowledge={listKnowledge(id)}
      baseUrl={base}
      activeProvider={ai.activeProvider}
      providerModels={{ anthropic: ai.providers.anthropic.model, openai: ai.providers.openai.model }}
    />
  );
}
