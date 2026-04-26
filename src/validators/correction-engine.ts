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
  /** 差异区域列表：{x, y, width, height} 为在 section 截图中的相对坐标 */
  diffAreas?: Array<{ x: number; y: number; width: number; height: number }>;
  /** 差异特征：颜色差异、布局偏移、文字缺失等 */
  diffFeatures?: string[];
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
        "You are a frontend code expert specializing in pixel-perfect UI implementation. Analyze the visual diff, identify the root cause, and fix the code. Return ONLY the corrected code block.",
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
  const areas = diff.diffAreas && diff.diffAreas.length > 0
    ? diff.diffAreas.map(a => `  - Region: x=${a.x}, y=${a.y}, w=${a.width}, h=${a.height}`).join("\n")
    : "  - No specific regions detected (diffuse differences)";

  const features = diff.diffFeatures && diff.diffFeatures.length > 0
    ? diff.diffFeatures.map(f => `  - ${f}`).join("\n")
    : "  - General visual mismatch";

  return `Fix this React component to match the design baseline.

## Visual Diff Analysis
- Section type: ${kind}
- Diff percentage: ${(diff.diffPercent * 100).toFixed(1)}%
- Attempt: ${attempt}/${3}

## Problem Areas
${areas}

## Detected Issues
${features}

${diff.details ? `## Additional Context\n${diff.details}\n` : ""}
## Current Code
\`\`\`tsx
${code}
\`\`\`

## Instructions
1. Analyze the visual diff data above to identify specific mismatches
2. Fix layout, colors, spacing, typography, or alignment issues
3. Ensure the code produces pixel-perfect output matching the design
4. Return ONLY the corrected TSX code in a code block`;
}

function extractCode(response: string): string | null {
  // Try tsx, ts, jsx, js, html code blocks
  const match = response.match(/\`\`\`(?:tsx?|jsx?|html)?\s*\n([\s\S]*?)\`\`\`/);
  if (match) return match[1].trim();
  // Fallback: if no code block, return the whole response if it looks like code
  if (response.includes("import ") || response.includes("function ") || response.includes("export ")) {
    return response.trim();
  }
  return null;
}
