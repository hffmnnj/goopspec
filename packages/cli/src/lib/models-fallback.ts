export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
}

export const FALLBACK_MODELS: ModelEntry[] = [
  // Anthropic
  { id: "anthropic/claude-opus-4-5", name: "Claude Opus 4.5", provider: "Anthropic" },
  { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "anthropic/claude-opus-4", name: "Claude Opus 4", provider: "Anthropic" },
  { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic" },

  // OpenAI
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "openai/o3", name: "o3", provider: "OpenAI" },
  { id: "openai/o4-mini", name: "o4-mini", provider: "OpenAI" },
  { id: "openai/gpt-5", name: "GPT-5", provider: "OpenAI" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI" },

  // Google
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google" },

  // Groq
  { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "Groq" },
  { id: "groq/deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill Llama 70B", provider: "Groq" },

  // Mistral
  { id: "mistral/mistral-large-latest", name: "Mistral Large", provider: "Mistral" },
  { id: "mistral/codestral-latest", name: "Codestral", provider: "Mistral" },

  // OpenRouter
  { id: "openrouter/deepseek/deepseek-r1", name: "DeepSeek R1", provider: "OpenRouter" },
  { id: "openrouter/meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "OpenRouter" },
];
