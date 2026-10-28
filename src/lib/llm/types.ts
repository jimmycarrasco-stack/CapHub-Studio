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
  /** One tool-using model call (an agent "step"). */
  step(req: StepRequest): Promise<StepResult>;
}

// ───────────── Tool use (provider-neutral) ─────────────

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool input (type: "object"). */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed input. `null` when the model's JSON couldn't be parsed (e.g. output was cut off). */
  input: Record<string, unknown> | null;
}

export interface ToolResult {
  id: string;
  output: string;
  isError?: boolean;
}

export type AgentMessage =
  | { role: "user"; content: string }
  /** `raw` is the provider's own output (content blocks / output items), replayed verbatim to the same provider. */
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; raw: unknown }
  | { role: "tool"; results: ToolResult[] };

export interface StepRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolDef[];
  maxTokens: number;
  model?: string | null;
  signal?: AbortSignal;
  /** Live text deltas as the model writes. */
  onText?: (delta: string) => void;
}

export interface StepResult {
  text: string;
  toolCalls: ToolCall[];
  raw: unknown;
  /** "tool_use" = wants tools run; "end" = finished; "max_tokens" = cut off. */
  stop: "tool_use" | "end" | "max_tokens";
  usage: { input: number; output: number };
}
