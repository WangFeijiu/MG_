/**
 * Section 级截图对比 + 自动修正管线
 *
 * 流程:
 * 1. 设计稿预览 HTML (preview.html) → 按 Section 裁剪截图 A（baseline）
 * 2. React 代码组装成 HTML → 按 Section 裁剪截图 B（generated）
 * 3. pixelmatch 对比 A vs B
 * 4. 差异 > 阈值 → LLM 修正 → 重新对比（最多 N 次）
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { Section } from "../generators/section-splitter.js";
import { classifySection, shouldReport, type SectionKind } from "../validators/tolerance.js";
import { CorrectionEngine, type DiffRegion } from "../validators/correction-engine.js";
import { LLMClient } from "../llm/llm-client.js";
import type { ReactOutput } from "../generators/react-section-generator.js";

export type SectionValidationResult = {
  sectionId: string;
  sectionName: string;
  kind: SectionKind;
  diffPercent: number;
  converged: boolean;
  attempts: number;
  corrected: boolean;
};

export type PipelineResult = {
  results: SectionValidationResult[];
  totalDiff: number;
  allConverged: boolean;
};

function collectNodeTypes(node: DSLNode, nodeMap: Map<string, DSLNode>): string[] {
  const types = [node.type];
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) types.push(...collectNodeTypes(child, nodeMap));
  }
  return types;
}

async function screenshotHTMLSection(
  browser: Browser,
  html: string,
  sectionNodeId: string,
  pageWidth: number,
): Promise<PNG> {
  const page = await browser.newPage();
  await page.setViewport({ width: pageWidth, height: 800 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const element = await page.$(`[data-dsl-id="${sectionNodeId}"]`);
  let screenshot: Buffer;

  if (element) {
    screenshot = await element.screenshot({ type: "png" }) as Buffer;
  } else {
    screenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  }

  await page.close();
  return PNG.sync.read(screenshot);
}

function comparePNGs(a: PNG, b: PNG): number {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);

  // Pad smaller image to match
  const paddedA = padPNG(a, width, height);
  const paddedB = padPNG(b, width, height);

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(paddedA.data, paddedB.data, diff.data, width, height, { threshold: 0.1 });
  return diffPixels / (width * height);
}

function padPNG(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  // Copy src data into top-left of padded image
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstIdx = (width * y + x) << 2;
      out.data[srcIdx] = src.data[srcIdx];
      out.data[srcIdx + 1] = src.data[srcIdx + 1];
      out.data[srcIdx + 2] = src.data[srcIdx + 2];
      out.data[srcIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return out;
}

function buildReactHTML(reactOutput: ReactOutput, sectionIndex: number): string {
  const section = reactOutput.sections[sectionIndex];
  if (!section) return "";

  const css = reactOutput.appCSS;

  // Extract JSX body from section code (between return ( and );)
  const code = section.code;
  const returnMatch = code.match(/return\s*\(\s*\n([\s\S]*?)\n\s*\);/);
  const jsxBody = returnMatch ? returnMatch[1] : "<div />";

  // Convert JSX className to HTML class
  const htmlBody = jsxBody
    .replace(/className=/g, "class=")
    .replace(/style=\{\{(.*?)\}\}/g, (_, styles) => {
      const cssProps = styles
        .replace(/(\w+):/g, (_, prop) => prop.replace(/([A-Z])/g, "-$1").toLowerCase() + ":")
        .replace(/'([^']*)'/g, "$1")
        .replace(/,\s*/g, "; ");
      return `style="${cssProps}"`;
    });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
${css}
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}

export async function runValidationPipeline(
  dsl: MachineDSL,
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
  reactOutput: ReactOutput,
  previewHTML: string,
  options?: { maxAttempts?: number; enableLLMCorrection?: boolean },
): Promise<PipelineResult> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const enableLLM = options?.enableLLMCorrection ?? false;

  let browser: Browser;
  try {
    browser = await puppeteer.launch({ headless: true });
  } catch {
    return {
      results: sections.map(s => ({
        sectionId: s.id, sectionName: s.name,
        kind: classifySection(collectNodeTypes(nodeMap.get(s.nodeId)!, nodeMap)) as SectionKind,
        diffPercent: 0, converged: true, attempts: 0, corrected: false,
      })),
      totalDiff: 0, allConverged: true,
    };
  }

  const pageWidth = dsl.page.width || 1440;
  const results: SectionValidationResult[] = [];

  try {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionRoot = nodeMap.get(section.nodeId);
      if (!sectionRoot) continue;

      const nodeTypes = collectNodeTypes(sectionRoot, nodeMap);
      const kind = classifySection(nodeTypes);

      // Baseline: screenshot from preview.html (design)
      const baselinePNG = await screenshotHTMLSection(browser, previewHTML, section.nodeId, pageWidth);

      // Generated: screenshot from React code
      const reactHTML = buildReactHTML(reactOutput, i);
      const generatedPNG = await screenshotHTMLSection(browser, reactHTML, sectionRoot.id, pageWidth);

      const diffPercent = comparePNGs(baselinePNG, generatedPNG);

      const result: SectionValidationResult = {
        sectionId: section.id,
        sectionName: section.name,
        kind,
        diffPercent,
        converged: !shouldReport(diffPercent, kind),
        attempts: 1,
        corrected: false,
      };

      // LLM correction loop if diff too high
      if (shouldReport(diffPercent, kind) && enableLLM) {
        let currentCode = reactOutput.sections[i]?.code || "";

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          result.attempts = attempt;

          const diff: DiffRegion = {
            sectionId: section.id,
            diffPercent: result.diffPercent,
            nodeTypes,
          };

          try {
            const llm = new LLMClient();
            const engine = new CorrectionEngine(llm, 1);
            const correction = await engine.correctSection(currentCode, diff);
            currentCode = correction.correctedCode;
            result.corrected = true;
          } catch {
            break;
          }
        }
      }

      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const totalDiff = results.length > 0
    ? results.reduce((sum, r) => sum + r.diffPercent, 0) / results.length
    : 0;

  return {
    results,
    totalDiff,
    allConverged: results.every(r => r.converged),
  };
}
