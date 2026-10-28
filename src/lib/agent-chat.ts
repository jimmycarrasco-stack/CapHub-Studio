import "server-only";
import { buildAgentSystemPrompt } from "./agent-prompt";
import { selectKnowledge } from "./knowledge";
import { getProvider } from "./llm";
import { addMessage, ensureConversation, getConversationMessages, listKnowledge, type Agent } from "./repo";

export const MAX_USER_MESSAGE = 4000;

/** One chat turn for an agent: retrieval → prompt → provider → persist. */
export async function runAgentTurn(agent: Agent, input: { conversationId?: string; message: string; source: "playground" | "widget" }) {
  const provider = getProvider(agent.provider); // throws a clear 400 if no key
  const conversationId = ensureConversation(agent.id, input.conversationId, input.source);
  const history = getConversationMessages(conversationId, 20);

  // Retrieve using the new message plus the previous user turn for follow-up questions.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const knowledge = selectKnowledge(`${input.message} ${lastUser}`, listKnowledge(agent.id));
  const system = buildAgentSystemPrompt(agent, knowledge);

  const reply = (
    await provider.complete({
      system,
      messages: [...history, { role: "user", content: input.message }],
      maxTokens: 1024,
      temperature: agent.temperature,
      model: agent.model,
    })
  ).trim();

  addMessage(conversationId, "user", input.message);
  addMessage(conversationId, "assistant", reply || "Sorry — I couldn't generate a reply. Please try again.");
  return { conversationId, reply, provider: provider.name, model: agent.model || provider.model };
}
