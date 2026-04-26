import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMClient, loadLLMConfig } from "../llm-client.js";

function mockClient(createFn: ReturnType<typeof vi.fn>) {
  return { messages: { create: createFn } } as any;
}

describe("loadLLMConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads config from LLM_* env vars", () => {
    process.env.LLM_API_KEY = "sk-test-123";
    process.env.LLM_BASE_URL = "https://proxy.example.com";
    process.env.LLM_MODEL = "claude-opus-4-7";
    process.env.LLM_MAX_TOKENS = "2048";
    process.env.LLM_TEMPERATURE = "0.3";

    const config = loadLLMConfig();
    expect(config.apiKey).toBe("sk-test-123");
    expect(config.baseUrl).toBe("https://proxy.example.com");
    expect(config.model).toBe("claude-opus-4-7");
    expect(config.maxTokens).toBe(2048);
    expect(config.temperature).toBe(0.3);
  });

  it("falls back to CLAUDE_API_KEY if LLM_API_KEY not set", () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    process.env.CLAUDE_API_KEY = "sk-fallback";

    const config = loadLLMConfig();
    expect(config.apiKey).toBe("sk-fallback");
    expect(config.baseUrl).toBe("https://api.anthropic.com");
    expect(config.model).toBe("claude-sonnet-4-6");
  });

  it("uses defaults when no env vars set", () => {
    delete process.env.LLM_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_MAX_TOKENS;
    delete process.env.LLM_TEMPERATURE;

    const config = loadLLMConfig();
    expect(config.apiKey).toBe("");
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0.7);
  });
});

describe("LLMClient", () => {
  it("throws if no API key configured", () => {
    expect(() => new LLMClient({ apiKey: "" })).toThrow("LLM API key");
  });

  it("accepts partial config override", () => {
    const mc = mockClient(vi.fn());
    const client = new LLMClient({
      apiKey: "test-key",
      model: "custom-model",
      client: mc,
    });
    expect(client.model).toBe("custom-model");
  });

  it("calls API with correct params", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Hello!" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const client = new LLMClient({
      apiKey: "test-key",
      model: "test-model",
      maxTokens: 1024,
      temperature: 0.5,
      client: mockClient(create),
    });

    const result = await client.chat(
      [{ role: "user", content: "Hi" }],
      "Test system",
    );

    expect(result.text).toBe("Hello!");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        max_tokens: 1024,
        temperature: 0.5,
        system: "Test system",
      }),
    );
  });

  it("retries on 429 and succeeds", async () => {
    let callCount = 0;
    const create = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error("Rate limited");
        err.status = 429;
        throw err;
      }
      return Promise.resolve({
        content: [{ type: "text", text: "Success" }],
        usage: { input_tokens: 5, output_tokens: 3 },
      });
    });

    const client = new LLMClient({
      apiKey: "test-key",
      model: "test-model",
      maxTokens: 1024,
      temperature: 0,
      client: mockClient(create),
    });

    const result = await client.chatWithRetry(
      [{ role: "user", content: "Hi" }],
      undefined,
      3,
    );

    expect(result.text).toBe("Success");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on 500", async () => {
    const create = vi.fn().mockImplementation(() => {
      const err: any = new Error("Server error");
      err.status = 500;
      throw err;
    });

    const client = new LLMClient({
      apiKey: "test-key",
      model: "test-model",
      maxTokens: 1024,
      temperature: 0,
      client: mockClient(create),
    });

    await expect(
      client.chatWithRetry([{ role: "user", content: "Hi" }], undefined, 2),
    ).rejects.toThrow("Server error");

    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 error", async () => {
    const create = vi.fn().mockImplementation(() => {
      const err: any = new Error("Bad request");
      err.status = 400;
      throw err;
    });

    const client = new LLMClient({
      apiKey: "test-key",
      model: "test-model",
      maxTokens: 1024,
      temperature: 0,
      client: mockClient(create),
    });

    await expect(
      client.chatWithRetry([{ role: "user", content: "Hi" }], undefined, 3),
    ).rejects.toThrow("Bad request");

    expect(create).toHaveBeenCalledTimes(1);
  });
});
