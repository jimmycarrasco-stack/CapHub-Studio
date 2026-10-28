import "server-only";
import { HttpError } from "../errors";
import { getActiveProvider, resolveProvider } from "../settings";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { PROVIDER_LABELS, PROVIDERS, type ProviderName } from "./catalog";
import type { LlmProvider } from "./types";

export type ProviderChoice = ProviderName | "default";

export function buildProvider(name: ProviderName, apiKey: string, model: string): LlmProvider {
  return name === "anthropic" ? anthropicProvider({ apiKey, model }) : openaiProvider({ apiKey, model });
}

/**
 * Returns the provider to use. "default" (or nothing) means the admin's active provider.
 * Throws a 400 with a clear message if that provider has no API key configured.
 */
export function getProvider(choice: ProviderChoice | null | undefined = "default"): LlmProvider {
  const name: ProviderName =
    choice && choice !== "default" && (PROVIDERS as readonly string[]).includes(choice) ? choice : getActiveProvider();
  const { apiKey, model } = resolveProvider(name);
  if (!apiKey) {
    throw new HttpError(400, `${PROVIDER_LABELS[name]} has no API key. Add one in Settings → AI & runtime (agency admins).`);
  }
  return buildProvider(name, apiKey, model);
}

export type { LlmProvider, ChatMessage, CompletionRequest } from "./types";
