/**
 * 自动化测试 — 多层差异检测 + LLM 修正 + 自动降级
 *
 * Pipeline:
 * 1. 生成 HTML
 * 2. Puppeteer 截图
 * 3. multiLayerDiffDetect (DOM几何 → 颜色 → 文字 → 截图)
 * 4. 输出差异报告
 * 5. 修正循环:
 *    a. 跳过 screenshot-only issues（截图差异不修）
 *    b. LLM 局部修正 layout/color/text issues
 *    c. 失败 Section 自动降级为 pixel mode
 *    d. 重检测
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { generatePreviewHTML } from "../generators/html-preview.js";
import { extractOriginalDslData } from "../converters/original-dsl-extractor.js";
import { splitSections, type Section } from "../generators/section-splitter.js";
import { buildSectionManifest, type SectionManifest } from "../generators/section-manifest.js";
import { classifySectionRisk, assessGridConfidence } from "../generators/section-risk-classifier.js";
import { renderGridHTML } from "../generators/programmatic-grid-renderer.js";
import { renderPixelHTML } from "../generators/programmatic-pixel-renderer.js";
import { multiLayerDiffDetect } from "../optimizers/multi-layer-diff-detector.js";
import { fixSectionHTML } from "../optimizers/llm-section-fixer.js";
import { writeDiffReport } from "../optimizers/diff-report-formatter.js";
import { inferGridLayout, type LayoutHint } from "../optimizers/layout-inference.js";
import type { PageDiffReport, DiffIssue } from "../types/diff-report.js";
import type { SectionSemantics } from "../generators/llm-semantic-analyzer.js";
import { extractCSSClasses } from "../optimizers/css-class-extractor.js";
import { flattenDOM } from "../optimizers/dom-flattener.js";
import { LLMClient } from "../llm/llm-client.js";
import { recognizeComponents } from "../generators/component-recognizer.js";
import { getAnimationCSS, injectAnimationClasses } from "../optimizers/animation-policy.js";
import { renderReactComponents } from "../generators/react-component-renderer.js";

config();

const MAX_FIX_ITERATIONS = 3;
const OUTPUT_DIR = "output";
const TEST_DIR = join(OUTPUT_DIR, "test-results");

export async function runAutomatedTests(): Promise<PageDiffReport> {
  console.log("\n🧪 开始自动化测试（多层差异检测 + 自动降级）...\n");

  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });

  // 读取 DSL
  const machineDSL: MachineDSL = JSON.parse(
    readFileSync(join(OUTPUT_DIR, "machine-dsl.json"), "utf-8"),
  );
  const originalDSL = JSON.parse(
    readFileSync(join(OUTPUT_DIR, "original-dsl.json"), "utf-8"),
  );
  const originalData = extractOriginalDslData(originalDSL);

  // 生成 HTML
  console.log("📄 生成 HTML...");
  let html = await generatePreviewHTML(machineDSL, { originalDslData: originalData });

  // CSS Class 提取 — 自动抽取重复 inline style
  const extraction = extractCSSClasses(html);
  if (extraction.extractedClasses > 0) {
    html = extraction.html;
    console.log(`✓ CSS 提取: ${extraction.extractedClasses} classes, 消除 ${extraction.eliminatedInlines} 个 inline style`);
  }

  // DOM Flatten — 消除无语义 wrapper 嵌套
  const flat = flattenDOM(html);
  if (flat.removed > 0) {
    html = flat.html;
    console.log(`✓ DOM 扁平化: 移除 ${flat.removed} 个无语义 wrapper\n`);
  }

  // 构建 nodeMap (提前，供组件识别使用)
  const nodeMap = new Map<string, DSLNode>();
  for (const node of machineDSL.nodes) nodeMap.set(node.id, node);

  // 组件识别 + 动画注入
  const recognitions = recognizeComponents(machineDSL.nodes, nodeMap);
  const animResult = getAnimationCSS(recognitions);
  if (animResult.classMap.size > 0) {
    html = injectAnimationClasses(html, animResult.classMap);
    console.log(`✓ 动画策略: ${animResult.classMap.size} 个组件动画注入 (${animResult.animatableCount}/${animResult.totalCount})`);
  }
  // 双指标 coverage:
  // - nodeRecognitionCoverage: 任何被识别的节点 / 总数 (含 image/icon/text, 容易接近 100%)
  // - meaningfulComponentCoverage: button/card/grid/card-list/accordion/link / 总 container 数
  const MEANINGFUL = new Set(["button", "card", "grid", "card-list", "accordion", "link"]);
  const nodeRecognitionCoverage = recognitions.length > 0
    ? recognitions.filter(r => r.component !== "unknown").length / recognitions.length
    : 0;
  const totalContainers = machineDSL.nodes.filter(n => n.type === "container").length;
  const meaningfulCount = recognitions.filter(r => MEANINGFUL.has(r.component)).length;
  const meaningfulComponentCoverage = totalContainers > 0
    ? meaningfulCount / totalContainers
    : 0;
  const animationCoverage = animResult.totalCount > 0
    ? animResult.animatableCount / animResult.totalCount
    : 0;
  console.log(`✓ 组件识别: 节点 ${(nodeRecognitionCoverage * 100).toFixed(0)}%, 有效组件 ${(meaningfulComponentCoverage * 100).toFixed(0)}% (${meaningfulCount}/${totalContainers} containers)`);

  const htmlPath = resolve(join(TEST_DIR, "test-preview.html"));
  writeFileSync(htmlPath, html);
  console.log(`✓ HTML 已保存: ${htmlPath}\n`);

  // 读取设计稿
  const baselinePath = join(OUTPUT_DIR, "design-baseline.png");
  if (!existsSync(baselinePath)) throw new Error(`设计稿不存在: ${baselinePath}`);
  const baselineFull = PNG.sync.read(readFileSync(baselinePath));
  console.log(`✓ 设计稿: ${baselineFull.width}x${baselineFull.height}\n`);

  // 构建 Section + Manifest
  const sections = splitSections(machineDSL);
  const pageWidth = machineDSL.page.width || 1440;

  const manifests: SectionManifest[] = sections.map(s => {
    const root = nodeMap.get(s.nodeId);
    return root
      ? buildSectionManifest(root, nodeMap, s.name, pageWidth)
      : { sectionId: s.nodeId, sectionName: s.name, bounds: { x: 0, y: 0, width: pageWidth, height: 0 }, rootTag: "div", rootClassName: "", children: [] };
  });
  console.log(`✓ ${sections.length} 个 Section + Manifest\n`);

  // 启动浏览器 + 差异检测
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: pageWidth, height: 800 });
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(`document.documentElement.setAttribute("data-test-mode","")`);
  await new Promise(r => setTimeout(r, 3000));

  console.log("📊 开始多层差异检测...\n");

  // 构建 sectionModes map 供 code quality 评分
  const sectionModes = new Map<string, string>();
  for (const s of sections) {
    sectionModes.set(s.id, classifySectionRisk(s, nodeMap).mode);
  }

  let report = await multiLayerDiffDetect(page, sections, manifests, baselineFull, pageWidth, { sectionModes });

  // Pixel → Grid 自动升级策略
  let currentHTML = html;
  const pixelSections = [...sectionModes.entries()].filter(([_, m]) => m === "pixel");
  if (pixelSections.length > 0) {
    console.log(`\n🔄 Pixel → Grid 升级评估 (${pixelSections.length} 个 pixel section)...\n`);
    for (const [sectionId] of pixelSections) {
      const idx = sections.findIndex(s => s.id === sectionId);
      if (idx === -1) continue;
      const section = sections[idx];
      const manifest = manifests[idx];
      const root = nodeMap.get(section.nodeId);
      if (!root) continue;

      const children = root.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];
      const gridResult = assessGridConfidence(children, nodeMap);

      if (!gridResult.isGrid || gridResult.confidence < 0.82) {
        console.log(`   [Skip] ${section.name} — grid confidence=${gridResult.confidence.toFixed(2)} < 0.82`);
        continue;
      }

      // 生成 grid candidate
      const gridHTML = renderGridHTML(section, manifest, null);
      const candidateHTML = replaceSectionHTML(currentHTML, section.nodeId, gridHTML);

      // 评估对比
      writeFileSync(htmlPath, candidateHTML);
      await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.evaluate(`document.documentElement.setAttribute("data-test-mode","")`);
      await new Promise(r => setTimeout(r, 2000));

      const gridSectionModes = new Map(sectionModes);
      gridSectionModes.set(sectionId, "grid");
      const gridReport = await multiLayerDiffDetect(page, [section], [manifest], baselineFull, pageWidth, { sectionModes: gridSectionModes });

      const oldSectionReport = report.sections.find(s => s.sectionId === section.nodeId);
      const newSectionReport = gridReport.sections[0];

      if (!newSectionReport) continue;

      const visualDrop = (oldSectionReport?.overallMatchRate ?? 1) - newSectionReport.overallMatchRate;
      const oldMaintainability = report.summary.codeQuality?.maintainabilityScore ?? 0;

      // 简化判断：视觉下降 < 3% 且 section 通过
      if (visualDrop <= 0.03 && newSectionReport.passed) {
        console.log(`   [Accept] ${section.name} — grid升级: visual ${(newSectionReport.overallMatchRate * 100).toFixed(1)}% (drop ${(visualDrop * 100).toFixed(1)}%), confidence=${gridResult.confidence.toFixed(2)}`);
        currentHTML = candidateHTML;
        sectionModes.set(sectionId, "grid");
      } else {
        console.log(`   [Reject] ${section.name} — visual drop ${(visualDrop * 100).toFixed(1)}% 或未通过, 保持 pixel`);
        writeFileSync(htmlPath, currentHTML);
      }
    }

    // 重新加载最终版本并重新检测
    writeFileSync(htmlPath, currentHTML);
    await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(`document.documentElement.setAttribute("data-test-mode","")`);
    await new Promise(r => setTimeout(r, 2000));
    report = await multiLayerDiffDetect(page, sections, manifests, baselineFull, pageWidth, { sectionModes });
  }

  // 修正循环
  for (let iteration = 1; iteration <= MAX_FIX_ITERATIONS; iteration++) {
    const failedSections = report.sections.filter(s => !s.passed);
    if (failedSections.length === 0) {
      console.log(`\n✅ 全部通过，无需修正\n`);
      break;
    }

    console.log(`\n🔧 修正循环 #${iteration}: ${failedSections.length} 个失败 Section...\n`);

    const llm = new LLMClient({ maxTokens: 32768 });

    for (const failed of failedSections) {
      const idx = sections.findIndex(s => s.nodeId === failed.sectionId);
      if (idx === -1) continue;

      // 跳过 screenshot-only issues — 截图差异不修
      const nonScreenshotIssues = failed.issues.filter(i => i.type !== "screenshot");
      if (nonScreenshotIssues.length === 0) {
        console.log(`   [Skip] ${failed.sectionName} — 只有截图差异，跳过`);
        continue;
      }

      // 自动降级: 第2轮仍失败 → 降级为 pixel mode
      if (iteration >= 2) {
        console.log(`   [Pixel] ${failed.sectionName} — 降级为程序化渲染`);
        const manifest = manifests[idx];
        const pixelHTML = renderPixelHTML(sections[idx], manifest, null);
        currentHTML = replaceSectionHTML(currentHTML, failed.sectionId, pixelHTML);
        continue;
      }

      // LLM 修正
      const sectionDivStart = currentHTML.indexOf(`data-dsl-id="${failed.sectionId}"`);
      if (sectionDivStart === -1) continue;

      // 提取 section 内容（兼容 section 标签和 div 标签）
      const openTagStart = currentHTML.lastIndexOf("<", sectionDivStart);
      const openTagEnd = currentHTML.indexOf(">", sectionDivStart);
      if (openTagStart === -1 || openTagEnd === -1) continue;

      const closeTag = findCloseTag(currentHTML, openTagStart);
      if (!closeTag) continue;

      const sectionHTML = currentHTML.substring(openTagStart, closeTag.end);
      const innerMatch = sectionHTML.match(/^<[^>]+>\n?([\s\S]*)\n?<\/[a-z]+>$/);
      const innerHTML = innerMatch ? innerMatch[1] : sectionHTML;

      console.log(`   [Fix] ${failed.sectionName} (${nonScreenshotIssues.length} issues)...`);
      const fixedInner = await fixSectionHTML(failed.sectionName, innerHTML, nonScreenshotIssues, manifests[idx], llm);

      if (fixedInner !== innerHTML) {
        const tagMatch = sectionHTML.match(/^<([a-z]+)/);
        const tag = tagMatch ? tagMatch[1] : "div";
        currentHTML = currentHTML.substring(0, openTagStart) +
          `<${tag} data-dsl-id="${failed.sectionId}">\n${fixedInner}\n</${tag}>` +
          currentHTML.substring(closeTag.end);
        console.log(`   ✓ 修正完成`);
      }
    }

    // 重新加载并检测
    writeFileSync(htmlPath, currentHTML);
    await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(`document.documentElement.setAttribute("data-test-mode","")`);
    await new Promise(r => setTimeout(r, 2000));

    report = await multiLayerDiffDetect(page, sections, manifests, baselineFull, pageWidth, { sectionModes });
  }

  await browser.close();

  // Layout inference: 对 pixel mode sections 推断布局
  const layoutHints: LayoutHint[] = [];
  for (let i = 0; i < sections.length; i++) {
    const mode = sectionModes.get(sections[i].id);
    if (mode === "pixel") {
      const hint = inferGridLayout(manifests[i]);
      if (hint.confidence > 0.5) layoutHints.push(hint);
    }
  }
  report.layoutHints = layoutHints;
  if (layoutHints.length > 0) {
    console.log(`\n📐 Layout Hints:`);
    for (const h of layoutHints) {
      console.log(`  ${h.sectionId.substring(0,12)} → ${h.inferredMode} (${(h.confidence * 100).toFixed(0)}%)${h.columnCount ? ` ${h.columnCount} cols` : ""}`);
    }
  }

  // 输出报告
  if (report.summary.codeQuality) {
    report.summary.codeQuality.nodeRecognitionCoverage = nodeRecognitionCoverage;
    report.summary.codeQuality.meaningfulComponentCoverage = meaningfulComponentCoverage;
    report.summary.codeQuality.animationCoverage = animationCoverage;
  }
  writeDiffReport(report, TEST_DIR);
  writeFileSync(join(TEST_DIR, "test-report.json"), JSON.stringify(report, null, 2));

  // React 组件输出
  console.log(`\n⚛️ 生成 React 组件输出...`);
  const reactOutput = renderReactComponents(machineDSL, recognitions, nodeMap);
  const reactDir = join(OUTPUT_DIR, "react");
  mkdirSync(reactDir, { recursive: true });
  const reactSectionsDir = join(reactDir, "sections");
  mkdirSync(reactSectionsDir, { recursive: true });
  writeFileSync(join(reactDir, "App.tsx"), reactOutput.appTSX);
  for (const section of reactOutput.sections) {
    writeFileSync(join(reactSectionsDir, section.fileName), section.code);
  }
  console.log(`✓ React 输出: ${reactOutput.sections.length} 组件 → ${reactDir}/`);
  console.log(`  组件映射: ${reactOutput.componentCoverage.mappedComponents}/${reactOutput.componentCoverage.totalComponents} (${(reactOutput.componentCoverage.coverage * 100).toFixed(0)}%)`);

  return report;
}

/** 替换 section HTML — 找到 data-dsl-id 匹配的标签并替换内容 */
function replaceSectionHTML(fullHTML: string, sectionId: string, newSectionHTML: string): string {
  const marker = `data-dsl-id="${sectionId}"`;
  const markerIdx = fullHTML.indexOf(marker);
  if (markerIdx === -1) return fullHTML;

  const openTagStart = fullHTML.lastIndexOf("<", markerIdx);
  if (openTagStart === -1) return fullHTML;

  const closeTag = findCloseTag(fullHTML, openTagStart);
  if (!closeTag) return fullHTML;

  return fullHTML.substring(0, openTagStart) + newSectionHTML + fullHTML.substring(closeTag.end);
}

/** 找到与 openTagStart 处开标签匹配的闭标签位置 */
function findCloseTag(html: string, openTagStart: number): { end: number } | null {
  const openTagEnd = html.indexOf(">", openTagStart);
  if (openTagEnd === -1) return null;

  const tagMatch = html.substring(openTagStart, openTagEnd + 1).match(/^<([a-z]+)/);
  if (!tagMatch) return null;
  const tagName = tagMatch[1];

  const selfClose = html.substring(openTagStart, openTagEnd + 1).endsWith("/>");
  if (selfClose) return { end: openTagEnd + 1 };

  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let depth = 1;
  let pos = openTagEnd + 1;

  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closeTag, pos);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // 确认是开标签而非自闭合
      const tagEnd = html.indexOf(">", nextOpen);
      if (tagEnd !== -1 && !html.substring(nextOpen, tagEnd + 1).endsWith("/>")) {
        depth++;
      }
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return { end: nextClose + closeTag.length };
      pos = nextClose + closeTag.length;
    }
  }
  return null;
}

// ========== 主入口 ==========

{
  runAutomatedTests()
    .then(report => {
      console.log("=".repeat(50));
      console.log(`通过: ${report.summary.passedSections}/${report.summary.totalSections}`);
      console.log(`平均匹配率: ${(report.summary.averageMatchRate * 100).toFixed(1)}%`);
      console.log("=".repeat(50));
      process.exit(report.summary.failedSections > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error("❌", err);
      process.exit(1);
    });
}
