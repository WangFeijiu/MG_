/**
 * LLM Section Fixer — 基于差异报告局部修正
 *
 * 输入: section HTML + diff issues + manifest
 * 输出: fixed HTML
 */

import { LLMClient } from "../llm/llm-client.js";
import type { DiffIssue } from "../types/diff-report.js";
import type { SectionManifest } from "../generators/section-manifest.js";
import { parseLLMOutput } from "../generators/llm-section-html-generator.js";

export async function fixSectionHTML(
  sectionName: string,
  currentHTML: string,
  issues: DiffIssue[],
  manifest: SectionManifest,
  llm: LLMClient,
): Promise<string> {
  if (issues.length === 0) return currentHTML;

  const issuesJSON = JSON.stringify(issues, null, 2);
  const manifestJSON = JSON.stringify(manifest, null, 2);

  const prompt = `Fix the following HTML section based on the detected issues.

## Current HTML
\`\`\`html
${currentHTML}
\`\`\`

## Detected Issues
${issuesJSON}

## Design Specification
${manifestJSON}

## Instructions
1. Fix ONLY the issues listed above — layout offsets, color mismatches, text/style problems
2. Preserve all working parts of the HTML unchanged
3. Use exact pixel values from the design specification
4. For layout issues: adjust padding, margin, gap, or positioning
5. For color issues: use the exact color from the specification
6. For text issues: fix font-size, font-weight, or text content
7. Output ONLY the fixed HTML code block, no explanation`;

  try {
    const response = await llm.chatWithRetry(
      [{ role: "user", content: prompt }],
      "You are an expert frontend developer fixing HTML to match a design specification. Only fix the reported issues, preserve everything else. Output ONLY the fixed HTML.",
      2,
    );

    const result = parseLLMOutput(response.text, sectionName);
    return result.html || currentHTML;
  } catch (err: any) {
    console.warn(`   ⚠️ Fix failed for [${sectionName}]: ${err.message}`);
    return currentHTML;
  }
}
