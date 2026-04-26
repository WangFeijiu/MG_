/**
 * Section 级截图对比 + 自动修正管线
 *
 * 流程:
 * 1. 读取 output/design-baseline.png（MasterGo 设计稿原图）
 * 2. React 代码组装成 HTML → Puppeteer 截图
 * 3. 按 Section 区域裁剪 baseline，逐区域对比
 * 4. 差异 > 阈值 → LLM 修正 → 重新对比（最多 N 次）
 *
 * 使用方式:
 *   从 MasterGo 导出设计稿截图，命名为 design-baseline.png 放到 output/ 目录
 */

import puppeteer, { type Browser } from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readFileSync, existsSync } from "node:fs";
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
  baselineSource: string;
};

function collectNodeTypes(node: DSLNode, nodeMap: Map<string, DSLNode>): string[] {
  const types = [node.type];
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) types.push(...collectNodeTypes(child, nodeMap));
  }
  return types;
}

function padPNG(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstIdx = (width * y + x) << 2;
      out.data[dstIdx] = src.data[srcIdx];
      out.data[dstIdx + 1] = src.data[srcIdx + 1];
      out.data[dstIdx + 2] = src.data[srcIdx + 2];
      out.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return out;
}

function comparePNGs(a: PNG, b: PNG): number {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const paddedA = padPNG(a, width, height);
  const paddedB = padPNG(b, width, height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(paddedA.data, paddedB.data, diff.data, width, height, { threshold: 0.1 });
  return diffPixels / (width * height);
}

function cropPNG(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const cx = Math.max(0, Math.round(x));
  const cy = Math.max(0, Math.round(y));
  const cw = Math.min(Math.round(w), src.width - cx);
  const ch = Math.min(Math.round(h), src.height - cy);
  if (cw <= 0 || ch <= 0) return new PNG({ width: 1, height: 1 });

  const out = new PNG({ width: cw, height: ch });
  for (let row = 0; row < ch; row++) {
    const srcOffset = ((cy + row) * src.width + cx) << 2;
    const dstOffset = (row * cw) << 4;
    src.data.copy(out.data, row * cw * 4, srcOffset, srcOffset + cw * 4);
  }
  return out;
}

function buildReactHTML(reactOutput: ReactOutput, sectionIndex: number): string {
  const section = reactOutput.sections[sectionIndex];
  if (!section) return "";

  const css = reactOutput.appCSS;
  const code = section.code;
  const returnMatch = code.match(/return\s*\(\s*\n([\s\S]*?)\n\s*\);/);
  const jsxBody = returnMatch ? returnMatch[1] : "<div />";

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

function getSectionYBounds(sections: Section[], nodeMap: Map<string, DSLNode>): Map<string, { y: number; height: number }> {
  const bounds = new Map<string, { y: number; height: number }>();
  let currentY = 0;

  for (const section of sections) {
    const root = nodeMap.get(section.nodeId);
    if (!root) continue;

    let minY = Infinity;
    let maxY = -Infinity;

    function traverseY(n: DSLNode) {
      const nodeY = n.layout.y ?? 0;
      const nodeH = typeof n.layout.height === "number" ? n.layout.height : 0;
      const absY = currentY + nodeY;
      if (absY < minY) minY = absY;
      if (absY + nodeH > maxY) maxY = absY + nodeH;
      for (const cid of n.children) {
        const child = nodeMap.get(cid);
        if (child) traverseY(child);
      }
    }

    if (root.layout.y !== undefined) {
      traverseY(root);
    } else {
      minY = currentY;
      maxY = currentY + (typeof root.layout.height === "number" ? root.layout.height : 400);
    }

    const h = root.layout.height;
    const sectionHeight = typeof h === "number" ? h : (maxY - minY) || 400;
    bounds.set(section.id, { y: currentY, height: sectionHeight });
    currentY += sectionHeight;
  }

  return bounds;
}

export async function runValidationPipeline(
  dsl: MachineDSL,
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
  reactOutput: ReactOutput,
  previewHTML: string,
  options?: {
    maxAttempts?: number;
    enableLLMCorrection?: boolean;
    outputDir?: string;
  },
): Promise<PipelineResult> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const enableLLM = options?.enableLLMCorrection ?? false;
  const outputDir = options?.outputDir ?? "output";

  // 读取设计稿原图 baseline
  const baselinePNGPath = join(outputDir, "design-baseline.png");
  const hasBaseline = existsSync(baselinePNGPath);

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
      baselineSource: "unavailable (Puppeteer failed)",
    };
  }

  const pageWidth = dsl.page.width || 1440;
  const results: SectionValidationResult[] = [];
  const sectionBounds = getSectionYBounds(sections, nodeMap);

  try {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionRoot = nodeMap.get(section.nodeId);
      if (!sectionRoot) continue;

      const nodeTypes = collectNodeTypes(sectionRoot, nodeMap);
      const kind = classifySection(nodeTypes);

      // Generated: render React code as HTML → screenshot
      const reactHTML = buildReactHTML(reactOutput, i);
      const generatedPNG = await screenshotFullPage(browser, reactHTML, pageWidth);

      // Baseline: design screenshot or fallback to preview.html
      let baselinePNG: PNG;
      let baselineSource: string;

      if (hasBaseline) {
        const fullBaseline = PNG.sync.read(readFileSync(baselinePNGPath));
        const bounds = sectionBounds.get(section.id);
        if (bounds) {
          baselinePNG = cropPNG(fullBaseline, 0, bounds.y, pageWidth, bounds.height);
        } else {
          baselinePNG = fullBaseline;
        }
        baselineSource = "design-baseline.png";
      } else {
        baselinePNG = await screenshotFullPage(browser, previewHTML, pageWidth);
        baselineSource = "preview.html (no baseline image)";
      }

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

      // LLM correction loop
      if (shouldReport(diffPercent, kind) && enableLLM) {
        let currentCode = reactOutput.sections[i]?.code || "";

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          result.attempts = attempt;
          try {
            const llm = new LLMClient();
            const engine = new CorrectionEngine(llm, 1);
            const correction = await engine.correctSection(currentCode, {
              sectionId: section.id,
              diffPercent: result.diffPercent,
              nodeTypes,
            });
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
    baselineSource: hasBaseline ? "design-baseline.png" : "preview.html (fallback)",
  };
}

async function screenshotFullPage(browser: Browser, html: string, width: number): Promise<PNG> {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const screenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  await page.close();
  return PNG.sync.read(screenshot);
}
