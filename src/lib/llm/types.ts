import type { ProviderName } from "./catalog";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Omitted when null/undefined so each provider/model uses its own default. */
  temperature?: number | null;
  /** Overrides the provider's configured model for this call. */
  model?: string | null;
  signal?: AbortSignal;
}

export interface LlmProvider {
  name: ProviderName;
  model: string;
  /** Streams text deltas. */
  stream(req: CompletionRequest): AsyncIterable<string>;
  /** Full text response (implemented on top of stream so long outputs don't time out). */
  complete(req: CompletionRequest): Promise<string>;
}
