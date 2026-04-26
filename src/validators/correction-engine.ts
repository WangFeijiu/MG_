/**
 * 自动修正引擎
 * 基于视觉差异调用 LLM 局部修正代码，支持收敛检测
 */

import { LLMClient, type LLMResponse } from "../llm/llm-client.js";
import { classifySection, shouldReport } from "../validators/tolerance.js";

export type DiffRegion = {
  sectionId: string;
  diffPercent: number;
  nodeTypes: string[];
  details?: string;
};

export type CorrectionResult = {
  sectionId: string;
  originalCode: string;
  correctedCode: string;
  attempts: number;
  converged: boolean;
  usage: { inputTokens: number; outputTokens: number };
};

export class CorrectionEngine {
  private llm: LLMClient;
  private maxAttempts: number;

  constructor(llm: LLMClient, maxAttempts = 3) {
    this.llm = llm;
    this.maxAttempts = maxAttempts;
  }

  async correctSection(
    sectionCode: string,
    diff: DiffRegion,
  ): Promise<CorrectionResult> {
    const kind = classifySection(diff.nodeTypes);
    let currentCode = sectionCode;
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    let lastDiff = diff.diffPercent;
    let converged = false;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const prompt = buildCorrectionPrompt(currentCode, diff, kind, attempt);
      const response = await this.llm.chatWithRetry(
        [{ role: "user", content: prompt }],
        "You are a React code expert. Return ONLY the corrected JSX code, no explanations.",
      );

      totalUsage.inputTokens += response.usage.inputTokens;
      totalUsage.outputTokens += response.usage.outputTokens;

      const extracted = extractCode(response.text);
      if (!extracted) continue;

      currentCode = extracted;

      if (!shouldReport(lastDiff, kind)) {
        converged = true;
        break;
      }
    }

    return {
      sectionId: diff.sectionId,
      originalCode: sectionCode,
      correctedCode: currentCode,
      attempts: 0,
      converged,
      usage: totalUsage,
    };
  }

  async correctMultiple(
    sections: Map<string, string>,
    diffs: DiffRegion[],
  ): Promise<CorrectionResult[]> {
    const results: CorrectionResult[] = [];

    for (const diff of diffs) {
      const code = sections.get(diff.sectionId);
      if (!code) continue;

      const result = await this.correctSection(code, diff);
      result.attempts = results.length + 1;
      results.push(result);
    }

    return results;
  }
}

function buildCorrectionPrompt(
  code: string,
  diff: DiffRegion,
  kind: string,
  attempt: number,
): string {
  return `Fix this React component. The visual diff shows ${diff.diffPercent}% difference in a "${kind}" section.

${diff.details || ""}

Current code:
\`\`\`tsx
${code}
\`\`\`

Attempt ${attempt}. Return ONLY the corrected TSX code.`;
}

function extractCode(response: string): string | null {
  const match = response.match(/```(?:tsx?)\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}
