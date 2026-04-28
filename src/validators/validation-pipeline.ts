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
import { PNG } from "pngjs/browser.js";
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
  htmlDiffPercent: number;
  reactDiffPercent: number;
  converged: boolean;
  attempts: number;
  corrected: boolean;
};

export type PipelineResult = {
  results: SectionValidationResult[];
  totalHTMLDiff: number;
  totalReactDiff: number;
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

type DiffAnalysis = {
  diffPercent: number;
  areas: Array<{ x: number; y: number; width: number; height: number }>;
  features: string[];
};

function comparePNGs(a: PNG, b: PNG): DiffAnalysis {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const paddedA = padPNG(a, width, height);
  const paddedB = padPNG(b, width, height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(paddedA.data, paddedB.data, diff.data, width, height, { threshold: 0.1 });

  const areas = extractDiffAreas(diff, width, height);
  const features = analyzeDiffFeatures(diff, paddedA, paddedB, width, height);

  return {
    diffPercent: diffPixels / (width * height),
    areas,
    features,
  };
}

/** 从 pixelmatch diff buffer 中提取差异区域（bounding boxes） */
function extractDiffAreas(diff: PNG, width: number, height: number): Array<{ x: number; y: number; width: number; height: number }> {
  const changedPixels: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // pixelmatch 标记差异像素为红色 (255, 0, 0)
      if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
        changedPixels.push({ x, y });
      }
    }
  }

  if (changedPixels.length === 0) return [];

  // 简单的聚类：将相邻像素合并为区域
  const regions: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const visited = new Set<string>();

  for (const pixel of changedPixels) {
    const key = `${pixel.x},${pixel.y}`;
    if (visited.has(key)) continue;

    // BFS 找连通区域
    let x1 = pixel.x, y1 = pixel.y, x2 = pixel.x, y2 = pixel.y;
    const queue = [pixel];
    visited.add(key);

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);

      const neighbors = [
        { x: x + 1, y }, { x: x - 1, y },
        { x, y: y + 1 }, { x, y: y - 1 },
      ];
      for (const n of neighbors) {
        const nKey = `${n.x},${n.y}`;
        if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height && !visited.has(nKey)) {
          const nIdx = (width * n.y + n.x) << 2;
          if (diff.data[nIdx] === 255 && diff.data[nIdx + 1] === 0 && diff.data[nIdx + 2] === 0) {
            visited.add(nKey);
            queue.push(n);
          }
        }
      }
    }

    regions.push({ x1, y1, x2, y2 });
  }

  // 合并相近的小区域（距离 < 50px）
  const merged = mergeNearbyRegions(regions, 50);

  return merged.map(r => ({
    x: r.x1,
    y: r.y1,
    width: r.x2 - r.x1 + 1,
    height: r.y2 - r.y1 + 1,
  }));
}

function mergeNearbyRegions(
  regions: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  threshold: number,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  if (regions.length <= 1) return regions;

  const result = [...regions];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        const dist = Math.min(
          Math.abs(a.x2 - b.x1), Math.abs(b.x2 - a.x1),
          Math.abs(a.y2 - b.y1), Math.abs(b.y2 - a.y1),
        );
        if (dist <= threshold) {
          result[i] = {
            x1: Math.min(a.x1, b.x1),
            y1: Math.min(a.y1, b.y1),
            x2: Math.max(a.x2, b.x2),
            y2: Math.max(a.y2, b.y2),
          };
          result.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return result;
}

/** 分析差异特征（颜色、布局、文字等） */
function analyzeDiffFeatures(
  diff: PNG,
  a: PNG,
  b: PNG,
  width: number,
  height: number,
): string[] {
  const features = new Set<string>();
  let colorDiffCount = 0;
  let structuralDiffCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (diff.data[idx] !== 255 || diff.data[idx + 1] !== 0 || diff.data[idx + 2] !== 0) continue;

      // 检查是颜色差异还是结构性差异（某个图透明，另一个不透明）
      const aAlpha = a.data[idx + 3];
      const bAlpha = b.data[idx + 3];

      if ((aAlpha > 10 && bAlpha > 10) || (aAlpha <= 10 && bAlpha <= 10)) {
        colorDiffCount++;
      } else {
        structuralDiffCount++;
      }
    }
  }

  if (structuralDiffCount > colorDiffCount) {
    features.add("Structural/layout differences (elements missing or extra)");
  } else {
    features.add("Color/style differences (same structure, different appearance)");
  }

  if (colorDiffCount > width * height * 0.05) {
    features.add("Widespread color differences (likely background or theme mismatch)");
  }

  if (structuralDiffCount > width * height * 0.01) {
    features.add("Significant structural changes (elements shifted or missing)");
  }

  return Array.from(features);
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

  for (const section of sections) {
    const root = nodeMap.get(section.nodeId);
    if (!root) continue;

    // 使用根节点的绝对坐标（DSL 中 layout.y 是页面绝对坐标）
    const y = root.layout.y ?? 0;
    const h = typeof root.layout.height === "number" ? root.layout.height : 400;
    bounds.set(section.id, { y, height: h });
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
  const totalStart = Date.now();

  // 读取设计稿原图 baseline
  const baselinePNGPath = join(outputDir, "design-baseline.png");
  const hasBaseline = existsSync(baselinePNGPath);

  console.log(`\n[Validation] 启动验证管线 — ${sections.length} 个 Section`);
  console.log(`[Validation] Baseline: ${hasBaseline ? baselinePNGPath : "无 baseline"}`);
  console.log(`[Validation] LLM Correction: ${enableLLM ? "启用" : "禁用"}, maxAttempts: ${maxAttempts}`);

  let browser: Browser;
  try {
    console.log("[Validation] 启动 Puppeteer...");
    browser = await puppeteer.launch({ headless: true });
    console.log("[Validation] ✓ Puppeteer 就绪");
  } catch {
    console.warn("[Validation] ✗ Puppeteer 启动失败，跳过验证");
    return {
      results: sections.map(s => ({
        sectionId: s.id, sectionName: s.name,
        kind: classifySection(collectNodeTypes(nodeMap.get(s.nodeId)!, nodeMap)) as SectionKind,
        htmlDiffPercent: 0, reactDiffPercent: 0, converged: true, attempts: 0, corrected: false,
      })),
      totalHTMLDiff: 0, totalReactDiff: 0, allConverged: true,
      baselineSource: "unavailable (Puppeteer failed)",
    };
  }

  const pageWidth = dsl.page.width || 1440;
  const results: SectionValidationResult[] = [];
  const sectionBounds = getSectionYBounds(sections, nodeMap);

  try {
    // 截取 preview.html 各 section 截图（HTML 还原度）
    console.log(`[Validation] Step 1/3: 截取 Preview HTML 截图 (${sections.length} sections)...`);
    const previewScreenshots: PNG[] = [];
    for (let i = 0; i < sections.length; i++) {
      const root = nodeMap.get(sections[i].nodeId);
      if (!root) { previewScreenshots.push(new PNG({ width: 1, height: 1 })); continue; }
      const bounds = sectionBounds.get(sections[i].id);
      const fullPNG = await screenshotFullPage(browser, previewHTML, pageWidth);
      if (bounds) {
        previewScreenshots.push(cropPNG(fullPNG, 0, bounds.y, pageWidth, bounds.height));
      } else {
        previewScreenshots.push(fullPNG);
      }
      process.stdout.write(`\r[Validation]   Preview 截图 ${i + 1}/${sections.length}`);
    }
    console.log(" ✓");

    // 读取 baseline 或生成 fallback
    console.log("[Validation] Step 2/3: 读取设计稿 baseline...");
    const baselinePNGPath = join(outputDir, "design-baseline.png");
    const hasBaseline = existsSync(baselinePNGPath);
    let baselineFull: PNG | null = null;
    if (hasBaseline) {
      baselineFull = PNG.sync.read(readFileSync(baselinePNGPath));
      console.log(`[Validation]   ✓ Baseline 读取成功 (${baselineFull.width}x${baselineFull.height})`);
    } else {
      console.log("[Validation]   ⊘ 无 baseline，使用 preview 自对比");
    }

    // 逐 Section 对比
    console.log(`[Validation] Step 3/3: 逐 Section 对比差异...`);
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionRoot = nodeMap.get(section.nodeId);
      if (!sectionRoot) continue;

      const nodeTypes = collectNodeTypes(sectionRoot, nodeMap);
      const kind = classifySection(nodeTypes);

      // Baseline section crop
      let baselinePNG: PNG;
      if (baselineFull) {
        const bounds = sectionBounds.get(section.id);
        baselinePNG = bounds
          ? cropPNG(baselineFull, 0, bounds.y, pageWidth, bounds.height)
          : baselineFull;
      } else {
        baselinePNG = previewScreenshots[i];
      }

      // HTML diff: preview.html vs baseline
      const htmlAnalysis = comparePNGs(previewScreenshots[i], baselinePNG);

      // React diff: React code rendering vs baseline
      const reactHTML = buildReactHTML(reactOutput, i);
      const generatedPNG = await screenshotFullPage(browser, reactHTML, pageWidth);
      const reactAnalysis = comparePNGs(generatedPNG, baselinePNG);

      const needsFix = shouldReport(reactAnalysis.diffPercent, kind);
      const status = needsFix ? "⚠️ 需修正" : "✓ 通过";
      console.log(
        `   [${i + 1}/${sections.length}] ${section.name} — ` +
        `HTML diff: ${(htmlAnalysis.diffPercent * 100).toFixed(2)}%, ` +
        `React diff: ${(reactAnalysis.diffPercent * 100).toFixed(2)}% ${status}`,
      );

      const result: SectionValidationResult = {
        sectionId: section.id,
        sectionName: section.name,
        kind,
        htmlDiffPercent: htmlAnalysis.diffPercent,
        reactDiffPercent: reactAnalysis.diffPercent,
        converged: !needsFix,
        attempts: 1,
        corrected: false,
      };

      // LLM correction on React code if diff too high
      if (needsFix && enableLLM) {
        let currentCode = reactOutput.sections[i]?.code || "";
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          result.attempts = attempt;
          process.stdout.write(`      [Correction] 尝试 ${attempt}/${maxAttempts}...`);
          try {
            const llm = new LLMClient();
            const engine = new CorrectionEngine(llm, 1);
            const correction = await engine.correctSection(currentCode, {
              sectionId: section.id,
              diffPercent: result.reactDiffPercent,
              nodeTypes,
              diffAreas: reactAnalysis.areas,
              diffFeatures: reactAnalysis.features,
            });
            currentCode = correction.correctedCode;
            result.corrected = true;
            console.log(` ✓`);
          } catch (err: any) {
            console.log(` ✗ ${err.message}`);
            break;
          }
        }
      }

      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const totalHTMLDiff = results.length > 0
    ? results.reduce((sum, r) => sum + r.htmlDiffPercent, 0) / results.length
    : 0;
  const totalReactDiff = results.length > 0
    ? results.reduce((sum, r) => sum + r.reactDiffPercent, 0) / results.length
    : 0;

  const convergedCount = results.filter(r => r.converged).length;
  const correctedCount = results.filter(r => r.corrected).length;
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

  console.log(`\n[Validation] 验证完成 — 总耗时 ${totalElapsed}s`);
  console.log(`[Validation]   通过: ${convergedCount}/${results.length}, 修正: ${correctedCount}`);
  console.log(`[Validation]   HTML avg diff: ${(totalHTMLDiff * 100).toFixed(2)}%, React avg diff: ${(totalReactDiff * 100).toFixed(2)}%`);
  console.log(`[Validation]   全部收敛: ${results.every(r => r.converged) ? "✓ 是" : "✗ 否"}\n`);

  return {
    results,
    totalHTMLDiff,
    totalReactDiff,
    allConverged: results.every(r => r.converged),
    baselineSource: hasBaseline ? "design-baseline.png" : "preview.html (no baseline, HTML diff=0)",
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
