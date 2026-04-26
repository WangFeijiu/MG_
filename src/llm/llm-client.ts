/**
 * LLM 客户端
 * 支持 .env 配置：baseUrl、apiKey、model
 * 兼容 Claude API 和 OpenAI-compatible 端点
 */

import Anthropic from "@anthropic-ai/sdk";

export type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
};

export type LLMMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LLMResponse = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
};

export function loadLLMConfig(): LLMConfig {
  const apiKey = process.env.LLM_API_KEY || "";
  const baseUrl = process.env.LLM_BASE_URL || "https://api.anthropic.com";
  const model = process.env.LLM_MODEL || "claude-sonnet-4-6";
  const maxTokens = parseInt(process.env.LLM_MAX_TOKENS || "4096", 10);
  const temperature = parseFloat(process.env.LLM_TEMPERATURE || "0.7");

  return { apiKey, baseUrl, model, maxTokens, temperature };
}

export class LLMClient {
  private client: Pick<Anthropic, "messages">;
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig> & { client?: Pick<Anthropic, "messages"> }) {
    this.config = { ...loadLLMConfig(), ...(config || {}) };

    if (!this.config.apiKey) {
      throw new Error(
        "LLM API key not configured. Set LLM_API_KEY in .env",
      );
    }

    this.client = config?.client ?? new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  async chat(messages: LLMMessage[], system?: string): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: system || "You are a helpful assistant.",
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async chatWithRetry(
    messages: LLMMessage[],
    system?: string,
    retries = 3,
  ): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.chat(messages, system);
      } catch (error: any) {
        lastError = error;
        const isRetryable =
          error?.status === 429 || error?.status >= 500;
        if (!isRetryable || attempt === retries) break;

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError!;
  }

  get model(): string {
    return this.config.model;
  }
}
