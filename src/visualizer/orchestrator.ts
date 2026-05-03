/**
 * 可视化管线编排器
 *
 * 读取 output/ 产物，逐 section 执行截图 + 对比，
 * 通过回调发射事件，产物保存到 output/visualizer/。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";
import { PNG } from "pngjs/browser.js";

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { splitSections, type Section } from "../generators/section-splitter.js";
import { analyzeDSL, type DSLAnalysis } from "../generators/dsl-analyzer.js";
import { generatePreviewHTML } from "../generators/html-preview.js";
import { extractOriginalDslData, type OriginalDslData } from "../converters/original-dsl-extractor.js";
import { classifySection, getTolerance } from "../validators/tolerance.js";

import {
  screenshotFullPage,
  cropPNG,
  comparePNGs,
  savePNG,
  getSectionYBounds,
} from "./screenshot.js";
import type { VisualizerEvent, EventCallback, SectionCompletePayload } from "./types.js";

export async function runVisualizerPipeline(
  onEvent: EventCallback,
  options?: { outputDir?: string },
): Promise<void> {
  const outputDir = options?.outputDir ?? join(process.cwd(), "output");
  const vizDir = join(outputDir, "visualizer");
  const sectionsDir = join(vizDir, "sections");
  const baselinesDir = join(vizDir, "baselines");
  const diffsDir = join(vizDir, "diffs");

  for (const dir of [sectionsDir, baselinesDir, diffsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // ---- 加载 DSL ----
  const machineDSLPath = join(outputDir, "machine-dsl.json");
  if (!existsSync(machineDSLPath)) {
    onEvent({ type: "pipeline:error", data: { message: `未找到 ${machineDSLPath}，请先运行 npm run dev` } });
    return;
  }

  const dsl: MachineDSL = JSON.parse(readFileSync(machineDSLPath, "utf-8"));
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  // 加载原始 DSL（用于 extractOriginalDslData）
  let originalDslData: OriginalDslData | null = null;
  const originalDSLPath = join(outputDir, "original-dsl.json");
  if (existsSync(originalDSLPath)) {
    const originalDSL = JSON.parse(readFileSync(originalDSLPath, "utf-8"));
    originalDslData = extractOriginalDslData(originalDSL);
  }

  // ---- 分析 + 拆分 ----
  const analysis: DSLAnalysis = analyzeDSL(dsl);
  const sections: Section[] = splitSections(dsl);

  // 加载设计稿 baseline
  const baselinePath = join(outputDir, "design-baseline.png");
  const hasBaseline = existsSync(baselinePath);
  let baselineFull: PNG | null = null;
  if (hasBaseline) {
    baselineFull = PNG.sync.read(readFileSync(baselinePath));
  }

  const pageWidth = dsl.page.width || 1440;
  const rootNode = nodeMap.get(dsl.page.id);
  const pageHeight = rootNode?.layout?.height ?? 0;

  // ---- pipeline:start ----
  onEvent({
    type: "pipeline:start",
    data: {
      sectionCount: sections.length,
      pageName: dsl.page.name || "Untitled",
      pageWidth,
      pageHeight,
    },
  });

  // ---- 生成预览 HTML ----
  const previewHTML = await generatePreviewHTML(dsl, { originalDslData });

  // ---- Puppeteer 截图 ----
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
  } catch {
    onEvent({ type: "pipeline:error", data: { message: "Puppeteer 启动失败" } });
    return;
  }

  const totalStart = Date.now();
  const sectionBounds = getSectionYBounds(sections, nodeMap);
  const results: SectionCompletePayload[] = [];

  try {
    // 全页面截图（只截一次，优化性能）
    const fullScreenshot = await screenshotFullPage(browser, previewHTML, pageWidth);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const secAnalysis = analysis.sections?.[i];
      const bounds = sectionBounds.get(section.id);

      onEvent({
        type: "section:start",
        data: {
          id: section.id,
          name: section.name,
          index: i,
          total: sections.length,
          yPosition: bounds?.y ?? 0,
          height: bounds?.height ?? 0,
          semanticGuess: secAnalysis?.semanticGuess ?? "content",
        },
      });

      const sectionStart = Date.now();

      // 裁剪生成截图
      const secPNG = bounds
        ? cropPNG(fullScreenshot, 0, bounds.y, pageWidth, bounds.height)
        : new PNG({ width: 1, height: 1 });
      const secPath = join(sectionsDir, `section-${i}.png`);
      savePNG(secPNG, secPath);

      // 裁剪 baseline + 对比
      let diffPercent = 0;
      let areas: Array<{ x: number; y: number; width: number; height: number }> = [];
      let features: string[] = [];
      let converged = true;

      if (hasBaseline && baselineFull && bounds) {
        const blCrop = cropPNG(baselineFull, 0, bounds.y, pageWidth, bounds.height);
        const blPath = join(baselinesDir, `section-${i}.png`);
        savePNG(blCrop, blPath);

        const diffResult = comparePNGs(secPNG, blCrop);
        const diffPath = join(diffsDir, `section-${i}.png`);
        savePNG(diffResult.diffPNG, diffPath);

        diffPercent = diffResult.diffPercent;
        areas = diffResult.areas;
        features = diffResult.features;

        // 判断收敛
        const root = nodeMap.get(section.nodeId);
        const nodeTypes = root ? collectNodeTypes(root, nodeMap) : [];
        const kind = classifySection(nodeTypes);
        const tolerance = getTolerance(kind);
        converged = diffPercent <= tolerance.pixelThreshold;
      }

      const payload: SectionCompletePayload = {
        id: section.id,
        name: section.name,
        kind: getSectionKind(section, nodeMap),
        index: i,
        diffPercent,
        areas,
        features,
        generatedScreenshot: `/artifacts/sections/section-${i}.png`,
        baselineScreenshot: hasBaseline ? `/artifacts/baselines/section-${i}.png` : "",
        diffOverlay: hasBaseline ? `/artifacts/diffs/section-${i}.png` : "",
        converged,
        duration: Date.now() - sectionStart,
      };

      results.push(payload);
      onEvent({ type: "section:complete", data: payload });
    }
  } finally {
    await browser.close();
  }

  // ---- pipeline:complete ----
  const totalDuration = Date.now() - totalStart;
  const convergedCount = results.filter(r => r.converged).length;
  const totalHTMLDiff = results.length > 0
    ? results.reduce((sum, r) => sum + r.diffPercent, 0) / results.length
    : 0;

  onEvent({
    type: "pipeline:complete",
    data: {
      totalHTMLDiff,
      allConverged: convergedCount === results.length,
      sectionCount: results.length,
      convergedCount,
      totalDuration,
    },
  });

  // 写 report.json
  const reportPath = join(vizDir, "report.json");
  const report = {
    timestamp: new Date().toISOString(),
    pageName: dsl.page.name,
    pageWidth,
    hasBaseline,
    sections: results,
    summary: {
      totalHTMLDiff,
      allConverged: convergedCount === results.length,
      sectionCount: results.length,
      convergedCount,
      totalDuration,
    },
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
}

// ========== Helpers ==========

function collectNodeTypes(node: DSLNode, nodeMap: Map<string, DSLNode>): string[] {
  const types = [node.type];
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) types.push(...collectNodeTypes(child, nodeMap));
  }
  return types;
}

function getSectionKind(section: Section, nodeMap: Map<string, DSLNode>): string {
  const root = nodeMap.get(section.nodeId);
  if (!root) return "layout";
  return classifySection(collectNodeTypes(root, nodeMap));
}
