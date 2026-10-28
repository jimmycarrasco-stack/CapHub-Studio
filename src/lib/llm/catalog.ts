/** Shared, client-safe provider metadata. */

export const PROVIDERS = ["anthropic", "openai"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
};

/** Defaults only — the admin can type any model ID their account has access to. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.5",
};

export const MODEL_SUGGESTIONS: Record<ProviderName, string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"],
};

export const ENV_KEYS: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};
