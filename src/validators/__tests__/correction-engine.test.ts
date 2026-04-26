import { describe, it, expect, vi } from "vitest";
import { CorrectionEngine } from "../correction-engine.js";
import type { DiffRegion } from "../correction-engine.js";
import type { LLMResponse } from "../../llm/llm-client.js";

function mockLLM(responses: string[]) {
  let callIdx = 0;
  const usage = { inputTokens: 10, outputTokens: 20 };
  const create = vi.fn().mockImplementation(() => {
    const text = responses[callIdx++] || responses[responses.length - 1];
    return Promise.resolve({
      content: [{ type: "text", text }],
      usage,
    });
  });
  return { messages: { create: create } } as any;
}

const diff: DiffRegion = {
  sectionId: "s1",
  diffPercent: 0.05,
  nodeTypes: ["text"],
};

describe("CorrectionEngine", () => {
  it("corrects a section using LLM response", async () => {
    const correctedCode = 'export function Section1() { return <div className="fixed">Hello</div>; }';
    const llm = mockLLM([`\`\`\`tsx\n${correctedCode}\n\`\`\``]);
    const engine = new CorrectionEngine(
      { chatWithRetry: vi.fn().mockResolvedValue({ text: `\`\`\`tsx\n${correctedCode}\n\`\`\``, usage: { inputTokens: 10, outputTokens: 20 } }) } as any,
    );

    const result = await engine.correctSection('export function Section1() { return <div>Hello</div>; }', diff);

    expect(result.sectionId).toBe("s1");
    expect(result.correctedCode).toBe(correctedCode);
    expect(result.originalCode).toContain("Hello");
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it("handles multiple sections", async () => {
    const mockCorrect = vi.fn().mockResolvedValue({
      text: "```tsx\nexport function Fixed() {}\n```",
      usage: { inputTokens: 5, outputTokens: 10 },
    });
    const engine = new CorrectionEngine({
      chatWithRetry: mockCorrect,
    } as any, 1);

    const sections = new Map([
      ["s1", "code1"],
      ["s2", "code2"],
    ]);
    const diffs: DiffRegion[] = [
      { sectionId: "s1", diffPercent: 0.05, nodeTypes: ["text"] },
      { sectionId: "s2", diffPercent: 0.08, nodeTypes: ["image"] },
    ];

    const results = await engine.correctMultiple(sections, diffs);
    expect(results).toHaveLength(2);
    expect(mockCorrect).toHaveBeenCalledTimes(2);
  });

  it("skips sections not in map", async () => {
    const engine = new CorrectionEngine({
      chatWithRetry: vi.fn(),
    } as any);

    const sections = new Map([["s1", "code1"]]);
    const diffs: DiffRegion[] = [
      { sectionId: "s99", diffPercent: 0.5, nodeTypes: ["text"] },
    ];

    const results = await engine.correctMultiple(sections, diffs);
    expect(results).toHaveLength(0);
  });

  it("extracts code from markdown fences", async () => {
    const code = 'export function A() { return <p>hi</p>; }';
    const engine = new CorrectionEngine({
      chatWithRetry: vi.fn().mockResolvedValue({
        text: "Here's the fix:\n```tsx\n" + code + "\n```\nDone.",
        usage: { inputTokens: 5, outputTokens: 10 },
      }),
    } as any);

    const result = await engine.correctSection("old code", diff);
    expect(result.correctedCode).toBe(code);
  });
});
