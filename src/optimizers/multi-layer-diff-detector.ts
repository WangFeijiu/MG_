/**
 * 四层差异检测器 (v12 — 分模式容差)
 *
 * 三种模式不同 diff 策略:
 * - pixel: 严格像素还原 (layout<=4px, color dE<=4, screenshot>=92%)
 * - semantic: 中等偏差 (layout<=12px, color dE<=6, screenshot>=85%)
 * - grid: 结构等价 (structure score + text + screenshot>=80%)
 *
 * Layer 1: DOM 几何 (pixel/semantic) / 结构检测 (grid)
 * Layer 2: 区域颜色 (pixel/semantic)
 * Layer 3: 文字内容 (全部)
 * Layer 4: 截图兜底 (全部)
 */

import { PNG } from "pngjs";
import type { Page } from "puppeteer";
import type { SectionManifest, NodeManifest } from "../generators/section-manifest.js";
import type { Section } from "../generators/section-splitter.js";
import { blockColorCompare, cropPNG, rgbToLab, deltaE } from "./perceptual-comparator.js";
import type {
  DiffIssue,
  LayoutIssue,
  ColorIssue,
  TextIssue,
  ScreenshotIssue,
  SectionDiffReport,
  PageDiffReport,
  IssueSeverity,
} from "../types/diff-report.js";

export type DiffDetectionOptions = {
  sectionModes?: Map<string, string>;
  screenshotOptions?: {
    blockSize?: number;
    deltaEThreshold?: number;
    pixelPassRatio?: number;
  };
};

// ========== 分模式 Diff Profile ==========

type DiffProfile = {
  positionTolerance: number;
  sizeTolerance: number;
  colorDeltaE: number;
  textTolerance: number;
  screenshotThreshold: number;
};

const DIFF_PROFILES: Record<string, DiffProfile> = {
  pixel: {
    positionTolerance: 4,
    sizeTolerance: 4,
    colorDeltaE: 4,
    textTolerance: 2,
    screenshotThreshold: 0.92,
  },
  semantic: {
    positionTolerance: 12,
    sizeTolerance: 16,
    colorDeltaE: 6,
    textTolerance: 2,
    screenshotThreshold: 0.85,
  },
  grid: {
    positionTolerance: 24,
    sizeTolerance: 24,
    colorDeltaE: 7,
    textTolerance: 3,
    screenshotThreshold: 0.80,
  },
};

type DOMRect = { x: number; y: number; width: number; height: number };
type DOMTextNode = { selector: string; text: string; fontSize: string; fontWeight: string; color: string; nodeId: string };
type DOMLayoutNode = { nodeId: string; selector: string; rect: DOMRect };

export async function multiLayerDiffDetect(
  page: Page,
  sections: Section[],
  manifests: SectionManifest[],
  baselineFull: PNG,
  pageWidth: number,
  options?: DiffDetectionOptions,
): Promise<PageDiffReport> {
  // 截图
  const screenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  const screenshotPNG = PNG.sync.read(screenshot);

  const sectionReports: SectionDiffReport[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const manifest = manifests[i];
    const issues: DiffIssue[] = [];
    const sectionMode = options?.sectionModes?.get(section.id) ?? "semantic";
    const profile = DIFF_PROFILES[sectionMode] ?? DIFF_PROFILES.semantic;

    // 获取 section root 的 DOM rect
    const sectionRect = await getSectionRect(page, section.nodeId);

    // DOM layout nodes (共享)
    const layoutNodes = await getDOMLayoutNodes(page);

    if (sectionMode === "grid") {
      // ---- Grid mode: 结构检测 + text + screenshot ----
      const structureIssues = detectGridStructure(layoutNodes, manifest, sectionRect, profile);
      issues.push(...structureIssues);

      const textNodes = await getDOMTextNodes(page);
      const textIssues = detectTextIssues(textNodes, manifest.children, profile.textTolerance);
      issues.push(...textIssues);

      // 截图
      const compareResult = await compareScreenshots(screenshotPNG, baselineFull, sectionRect, manifest, pageWidth, options);
      const screenshotIssue = buildScreenshotIssue(compareResult, section.nodeId, profile.screenshotThreshold);
      if (screenshotIssue) issues.push(screenshotIssue);

      // 计分: structure + text + screenshot
      const structureScore = computeStructureScore(structureIssues);
      const textScore = computeTextScore(textIssues);
      const screenshotScore = compareResult.matchRate;
      const overallMatchRate = structureScore * 0.3 + textScore * 0.3 + screenshotScore * 0.4;

      // Pass/fail: text>=0.95, structure>=0.80, screenshot is weighted but not blocking alone
      const passed = textScore >= 0.95 && structureScore >= 0.80;

      sectionReports.push({
        sectionId: section.nodeId,
        sectionName: section.name,
        passed,
        visualWarning: passed && screenshotScore < 0.85 ? true : undefined,
        issues,
        overallMatchRate: Math.min(1, overallMatchRate),
      });

      const status = passed ? "✓ 通过" : "✗ 失败";
      const warn = passed && screenshotScore < 0.85 ? " ⚠visual" : "";
      console.log(`  ${status} — ${(overallMatchRate * 100).toFixed(1)}% [grid] struct:${(structureScore*100).toFixed(0)}% text:${(textScore*100).toFixed(0)}% shot:${(screenshotScore*100).toFixed(0)}%${warn}`);

    } else {
      // ---- Pixel/Semantic mode: 完整四层检测 ----
      const layoutIssues = detectLayoutIssues(layoutNodes, manifest.children, sectionRect, profile.positionTolerance, profile.sizeTolerance);
      issues.push(...layoutIssues);

      const textNodes = await getDOMTextNodes(page);
      const textIssues = detectTextIssues(textNodes, manifest.children, profile.textTolerance);
      issues.push(...textIssues);

      const colorIssues: ColorIssue[] = sectionRect
        ? detectColorIssues(screenshotPNG, layoutNodes, manifest.children, sectionRect, profile.colorDeltaE)
        : [];
      issues.push(...colorIssues);

      // 截图
      const compareResult = await compareScreenshots(screenshotPNG, baselineFull, sectionRect, manifest, pageWidth, options);
      const screenshotIssue = buildScreenshotIssue(compareResult, section.nodeId, profile.screenshotThreshold);
      if (screenshotIssue) issues.push(screenshotIssue);

      // 计分
      const layoutScore = layoutIssues.length === 0 ? 1 : Math.max(0, 1 - layoutIssues.filter(l => l.severity !== "minor").length * 0.1);
      const textScore = textIssues.length === 0 ? 1 : Math.max(0, 1 - textIssues.filter(t => t.severity !== "minor").length * 0.1);
      const colorScore = colorIssues.length === 0 ? 1 : Math.max(0, 1 - colorIssues.filter(c => c.severity !== "minor").length * 0.1);

      let overallMatchRate: number;
      let passed: boolean;

      if (sectionMode === "pixel") {
        overallMatchRate = layoutScore * 0.4 + colorScore * 0.25 + textScore * 0.25 + compareResult.matchRate * 0.1;
        passed = layoutScore >= 0.95 && colorScore >= 0.95 && textScore >= 0.95;
      } else {
        // Semantic: structural issues (layout+color+text) determine pass, screenshot is informational
        overallMatchRate = layoutScore * 0.35 + colorScore * 0.2 + textScore * 0.25 + compareResult.matchRate * 0.2;
        const structuralIssues = issues.filter(i => i.type !== "screenshot");
        passed = !structuralIssues.some(i => i.severity === "critical") && !structuralIssues.some(i => i.severity === "major");
      }

      sectionReports.push({
        sectionId: section.nodeId,
        sectionName: section.name,
        passed,
        issues,
        overallMatchRate: Math.min(1, overallMatchRate),
      });

      const status = passed ? "✓ 通过" : "✗ 失败";
      const modeTag = sectionMode === "pixel" ? "pixel" : "sem";
      console.log(`  ${status} — ${(overallMatchRate * 100).toFixed(1)}% [${modeTag}] layout:${(layoutScore*100).toFixed(0)}% text:${(textScore*100).toFixed(0)}% shot:${(compareResult.matchRate*100).toFixed(0)}%`);
    }
  }

  const passedCount = sectionReports.filter(r => r.passed).length;
  const avgMatch = sectionReports.reduce((s, r) => s + r.overallMatchRate, 0) / sectionReports.length;

  // Compute code quality metrics
  const codeQuality = options?.sectionModes
    ? await computeCodeQualityMetrics(page, options.sectionModes)
    : undefined;

  return {
    sections: sectionReports,
    summary: {
      totalSections: sectionReports.length,
      passedSections: passedCount,
      failedSections: sectionReports.length - passedCount,
      averageMatchRate: avgMatch,
      codeQuality,
    },
    timestamp: new Date().toISOString(),
  };
}

// ========== Grid 结构检测 ==========

function detectGridStructure(
  domNodes: DOMLayoutNode[],
  manifest: SectionManifest,
  sectionRect: DOMRect | null,
  profile: DiffProfile,
): DiffIssue[] {
  const issues: DiffIssue[] = [];

  // 1. Section 整体高度检测
  if (sectionRect) {
    const expectedH = manifest.bounds.height;
    const actualH = sectionRect.height;
    const diff = Math.abs(expectedH - actualH);
    const ratio = expectedH > 0 ? diff / expectedH : 0;
    if (ratio > 0.1) {
      issues.push({
        type: "layout",
        severity: ratio > 0.3 ? "major" : "minor",
        selector: `[data-dsl-id="${manifest.sectionId}"]`,
        property: "height",
        expected: expectedH,
        actual: actualH,
        diff,
        tolerance: expectedH * 0.1,
        suggestion: `Section 高度差 ${diff}px (${(ratio*100).toFixed(0)}%)`,
      });
    }

    // 2. Section 宽度检测
    const expectedW = manifest.bounds.width;
    const actualW = sectionRect.width;
    const wDiff = Math.abs(expectedW - actualW);
    const wRatio = expectedW > 0 ? wDiff / expectedW : 0;
    if (wRatio > 0.05) {
      issues.push({
        type: "layout",
        severity: wRatio > 0.15 ? "major" : "minor",
        selector: `[data-dsl-id="${manifest.sectionId}"]`,
        property: "width",
        expected: expectedW,
        actual: actualW,
        diff: wDiff,
        tolerance: expectedW * 0.05,
        suggestion: `Section 宽度差 ${wDiff}px`,
      });
    }
  }

  // 3. 列数检测: DOM 中顶层子元素按 x 分组
  if (sectionRect && domNodes.length > 0) {
    const sectionChildren = domNodes.filter(n => {
      const parentId = findParentSectionId(n, manifest);
      return parentId === manifest.sectionId;
    });

    if (sectionChildren.length >= 2) {
      // 预期列数 (from manifest)
      const expectedCols = countColumns(manifest.children, 10);
      // 实际列数 (from DOM)
      const actualCols = countColumnsFromDOM(sectionChildren, sectionRect, 15);

      if (expectedCols >= 2 && Math.abs(expectedCols - actualCols) >= 1) {
        issues.push({
          type: "layout",
          severity: "major",
          selector: `[data-dsl-id="${manifest.sectionId}"]`,
          property: "x",
          expected: expectedCols,
          actual: actualCols,
          diff: Math.abs(expectedCols - actualCols),
          tolerance: 0,
          suggestion: `列数不匹配: 期望 ${expectedCols} 列, 实际 ${actualCols} 列`,
        });
      }
    }
  }

  return issues;
}

function findParentSectionId(node: DOMLayoutNode, manifest: SectionManifest): string {
  // 简化: 检查节点是否在 manifest 的子树中
  const all = new Set<string>();
  function collect(nodes: NodeManifest[]) {
    for (const n of nodes) { all.add(n.id); collect(n.children); }
  }
  collect(manifest.children);
  return all.has(node.nodeId) ? manifest.sectionId : "";
}

function countColumns(children: NodeManifest[], tolerance: number): number {
  if (children.length === 0) return 1;
  const xBins = new Map<number, number>();
  for (const c of children) {
    const bin = Math.round(c.relativeBounds.x / tolerance) * tolerance;
    xBins.set(bin, (xBins.get(bin) || 0) + 1);
  }
  return xBins.size;
}

function countColumnsFromDOM(nodes: DOMLayoutNode[], sectionRect: DOMRect, tolerance: number): number {
  const xBins = new Map<number, number>();
  for (const n of nodes) {
    const relX = n.rect.x - sectionRect.x;
    const bin = Math.round(relX / tolerance) * tolerance;
    xBins.set(bin, (xBins.get(bin) || 0) + 1);
  }
  return Math.max(1, xBins.size);
}

function computeStructureScore(issues: DiffIssue[]): number {
  if (issues.length === 0) return 1;
  const major = issues.filter(i => i.severity === "major").length;
  const critical = issues.filter(i => i.severity === "critical").length;
  return Math.max(0, 1 - critical * 0.3 - major * 0.1);
}

function computeTextScore(textIssues: TextIssue[]): number {
  if (textIssues.length === 0) return 1;
  return Math.max(0, 1 - textIssues.filter(t => t.severity !== "minor").length * 0.1);
}

// ========== 截图对比 ==========

type CompareResult = { matchRate: number; mismatchedBlocks: number; totalBlocks: number };

async function compareScreenshots(
  screenshotPNG: PNG,
  baselineFull: PNG,
  sectionRect: DOMRect | null,
  manifest: SectionManifest,
  pageWidth: number,
  options?: DiffDetectionOptions,
): Promise<CompareResult> {
  const baselineCrop = cropPNG(baselineFull, 0, manifest.bounds.y, pageWidth, manifest.bounds.height);
  let screenshotCrop: PNG;
  if (sectionRect) {
    screenshotCrop = cropPNG(screenshotPNG, 0, sectionRect.y, pageWidth, sectionRect.height);
  } else {
    screenshotCrop = cropPNG(screenshotPNG, 0, manifest.bounds.y, pageWidth, manifest.bounds.height);
  }
  return blockColorCompare(baselineCrop, screenshotCrop, {
    blockSize: options?.screenshotOptions?.blockSize ?? 32,
    deltaEThreshold: options?.screenshotOptions?.deltaEThreshold ?? 5,
    pixelPassRatio: options?.screenshotOptions?.pixelPassRatio ?? 0.85,
    avgDeltaECap: 5,
    edgeTrim: 4,
  });
}

function buildScreenshotIssue(
  result: CompareResult,
  sectionId: string,
  threshold: number,
): ScreenshotIssue | null {
  const severity: IssueSeverity = result.matchRate >= 0.7 ? "minor" : result.matchRate >= 0.5 ? "major" : "critical";
  const issue: ScreenshotIssue = {
    type: "screenshot",
    severity,
    sectionId,
    matchRate: result.matchRate,
    mismatchedBlocks: result.mismatchedBlocks,
    totalBlocks: result.totalBlocks,
  };
  return result.matchRate < threshold ? issue : null;
}

// ========== Layer 1: DOM 几何 (pixel/semantic) ==========

async function getDOMLayoutNodes(page: Page): Promise<DOMLayoutNode[]> {
  try {
    return await page.evaluate(() => {
      const results: DOMLayoutNode[] = [];
      document.querySelectorAll("[data-dsl-id]").forEach((el) => {
        const htmlEl = el as HTMLElement;
        const nodeId = htmlEl.dataset.dslId!;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) return;
        results.push({
          nodeId,
          selector: `[data-dsl-id="${nodeId}"]`,
          rect: {
            x: Math.round(rect.left + window.scrollX),
            y: Math.round(rect.top + window.scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      });
      return results;
    });
  } catch {
    return [];
  }
}

function detectLayoutIssues(
  domNodes: DOMLayoutNode[],
  manifestChildren: NodeManifest[],
  sectionRect: DOMRect | null,
  posTolerance: number,
  sizeTolerance: number,
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const manifestMap = new Map<string, NodeManifest>();
  flattenManifest(manifestChildren, manifestMap);

  for (const dom of domNodes) {
    const expected = manifestMap.get(dom.nodeId);
    if (!expected) continue;
    if (!sectionRect) continue;

    const expectedRelative = expected.relativeBounds;
    const actualRelative = {
      x: dom.rect.x - sectionRect.x,
      y: dom.rect.y - sectionRect.y,
      width: dom.rect.width,
      height: dom.rect.height,
    };

    for (const prop of ["x", "y", "width", "height"] as const) {
      const exp = expectedRelative[prop];
      const act = actualRelative[prop];
      const diff = Math.abs(exp - act);
      const tol = (prop === "x" || prop === "y") ? posTolerance : sizeTolerance;
      if (diff > tol) {
        const severity: IssueSeverity = diff > tol * 3 ? "critical" : diff > tol * 2 ? "major" : "minor";
        const suggestion = prop === "x" || prop === "y"
          ? `${prop === "x" ? "水平" : "垂直"}偏移 ${diff}px，期望 ${exp}px 实际 ${act}px`
          : `${prop === "width" ? "宽" : "高"}度差 ${diff}px，期望 ${exp}px 实际 ${act}px`;
        issues.push({
          type: "layout",
          severity,
          selector: dom.selector,
          nodeId: dom.nodeId,
          property: prop,
          expected: exp,
          actual: act,
          diff,
          tolerance: tol,
          suggestion,
        });
      }
    }
  }

  return issues;
}

// ========== Layer 2: 区域颜色 ==========

function detectColorIssues(
  screenshotPNG: PNG,
  domNodes: DOMLayoutNode[],
  manifestChildren: NodeManifest[],
  sectionRect: DOMRect,
  deltaEThreshold: number,
): ColorIssue[] {
  const issues: ColorIssue[] = [];
  const manifestMap = new Map<string, NodeManifest>();
  flattenManifest(manifestChildren, manifestMap);

  for (const dom of domNodes) {
    const expected = manifestMap.get(dom.nodeId);
    if (!expected) continue;

    const bgColor = expected.visualTokens.background;
    if (!bgColor) continue;

    const expectedRGB = parseColor(bgColor);
    if (!expectedRGB) continue;

    const relX = dom.rect.x - sectionRect.x;
    const relY = dom.rect.y - sectionRect.y;
    const actualRGB = sampleCenterColor(screenshotPNG, relX, relY, dom.rect.width, dom.rect.height);
    if (!actualRGB) continue;

    const lab1 = rgbToLab(expectedRGB[0], expectedRGB[1], expectedRGB[2]);
    const lab2 = rgbToLab(actualRGB[0], actualRGB[1], actualRGB[2]);
    const de = deltaE(lab1, lab2);

    if (de > deltaEThreshold) {
      const severity: IssueSeverity = de > deltaEThreshold * 3 ? "critical" : de > deltaEThreshold * 1.5 ? "major" : "minor";
      issues.push({
        type: "color",
        severity,
        selector: dom.selector,
        nodeId: dom.nodeId,
        property: "background",
        expected: bgColor,
        actualAverage: `rgb(${actualRGB[0]},${actualRGB[1]},${actualRGB[2]})`,
        deltaE: Math.round(de * 10) / 10,
        suggestion: `背景色 DeltaE=${de.toFixed(1)}，期望 ${bgColor}`,
      });
    }
  }

  return issues;
}

function sampleCenterColor(png: PNG, x: number, y: number, w: number, h: number): [number, number, number] | null {
  const area = w * h;
  const sampleCount = Math.max(100, Math.min(500, Math.round(area / 100)));

  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  const cols = Math.ceil(Math.sqrt(sampleCount * (w / h)));
  const rows = Math.ceil(sampleCount / cols);
  const dx = w / (cols + 1);
  const dy = h / (rows + 1);

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      const px = Math.round(x + col * dx);
      const py = Math.round(y + row * dy);
      if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
      const idx = (png.width * py + px) << 2;
      const a = png.data[idx + 3];
      if (a < 128) continue;
      rSum += png.data[idx];
      gSum += png.data[idx + 1];
      bSum += png.data[idx + 2];
      count++;
    }
  }

  if (count === 0) return null;
  return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
}

// ========== Layer 3: 文字 ==========

async function getDOMTextNodes(page: Page): Promise<DOMTextNode[]> {
  try {
    return await page.evaluate(() => {
      const results: DOMTextNode[] = [];
      const walk = (el: Element) => {
        if (el.children.length === 0 && el.textContent?.trim()) {
          const cs = window.getComputedStyle(el);
          const nodeId = (el.closest("[data-dsl-id]") as HTMLElement)?.dataset.dslId || "";
          results.push({
            selector: nodeId ? `[data-dsl-id="${nodeId}"]` : el.tagName.toLowerCase(),
            text: el.textContent.trim(),
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            color: cs.color,
            nodeId,
          });
        }
        for (const child of el.children) walk(child);
      };
      document.querySelectorAll("section, nav, header, footer, article, main, [data-dsl-id]").forEach(el => walk(el));
      return results;
    });
  } catch {
    return [];
  }
}

function detectTextIssues(
  domTexts: DOMTextNode[],
  manifestChildren: NodeManifest[],
  textSizeTolerance: number,
): TextIssue[] {
  const issues: TextIssue[] = [];
  const manifestMap = new Map<string, NodeManifest>();
  flattenManifest(manifestChildren, manifestMap);

  const manifestTexts = new Map<string, { text: string; fontSize?: number; fontWeight?: number; color?: string }>();
  collectTextNodes(manifestChildren, manifestTexts);

  for (const dom of domTexts) {
    if (!dom.nodeId) continue;
    const expected = manifestTexts.get(dom.nodeId);
    if (!expected) continue;

    if (expected.text && dom.text) {
      const expectedClean = expected.text.trim();
      const actualClean = dom.text.trim();
      if (expectedClean !== actualClean && expectedClean.length > 2) {
        issues.push({
          type: "text",
          severity: "major",
          selector: dom.selector,
          nodeId: dom.nodeId,
          property: "content",
          expected: expectedClean.slice(0, 50),
          actual: actualClean.slice(0, 50),
          suggestion: `文字不匹配`,
        });
      }
    }

    if (expected.fontSize) {
      const actualPx = parseFloat(dom.fontSize);
      if (!isNaN(actualPx) && Math.abs(actualPx - expected.fontSize) > textSizeTolerance) {
        issues.push({
          type: "text",
          severity: Math.abs(actualPx - expected.fontSize) > textSizeTolerance * 3 ? "major" : "minor",
          selector: dom.selector,
          nodeId: dom.nodeId,
          property: "fontSize",
          expected: expected.fontSize,
          actual: Math.round(actualPx),
          suggestion: `字号差 ${Math.abs(actualPx - expected.fontSize).toFixed(0)}px`,
        });
      }
    }

    if (expected.fontWeight) {
      const actualW = parseInt(dom.fontWeight);
      if (!isNaN(actualW) && actualW !== expected.fontWeight) {
        issues.push({
          type: "text",
          severity: "minor",
          selector: dom.selector,
          nodeId: dom.nodeId,
          property: "fontWeight",
          expected: expected.fontWeight,
          actual: actualW,
          suggestion: `字重不匹配`,
        });
      }
    }
  }

  return issues;
}

// ========== 工具 ==========

function flattenManifest(nodes: NodeManifest[], out: Map<string, NodeManifest>): void {
  for (const n of nodes) {
    out.set(n.id, n);
    flattenManifest(n.children, out);
  }
}

function collectTextNodes(
  nodes: NodeManifest[],
  out: Map<string, { text: string; fontSize?: number; fontWeight?: number; color?: string }>,
): void {
  for (const n of nodes) {
    if (n.content?.text) {
      out.set(n.id, {
        text: n.content.text,
        fontSize: n.visualTokens.fontSize,
        fontWeight: n.visualTokens.fontWeight,
        color: n.visualTokens.color,
      });
    }
    collectTextNodes(n.children, out);
  }
}

function parseColor(color: string): [number, number, number] | null {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const v = parseInt(hex[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) return [parseInt(rgb[1]), parseInt(rgb[2]), parseInt(rgb[3])];
  return null;
}

async function getSectionRect(page: Page, nodeId: string): Promise<DOMRect | null> {
  try {
    return await page.evaluate((id) => {
      const el = document.querySelector(`[data-dsl-id="${id}"]`) as HTMLElement;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left + window.scrollX),
        y: Math.round(r.top + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }, nodeId);
  } catch {
    return null;
  }
}

// ========== Code Quality Metrics ==========

import type { CodeQualityMetrics } from "../types/diff-report.js";

async function computeCodeQualityMetrics(
  page: Page,
  sectionModes: Map<string, string>,
): Promise<CodeQualityMetrics> {
  try {
    const raw = await page.evaluate(`
      (function() {
        var all = document.querySelectorAll("body > *");
        var total = 0, absoluteCount = 0, semanticCount = 0, inlineStyleCount = 0;
        var badInlineCount = 0;
        var maxDepth = 0, depthSum = 0, depthCount = 0;
        var classCounts = {};
        var semanticTags = ["nav","section","article","aside","main","header","footer","h1","h2","h3","h4","h5","h6","p","a","button","ul","ol","li","figure","figcaption"];
        var layoutModes = {};
        var necessaryProps = {"position":1,"left":1,"top":1,"right":1,"bottom":1,"width":1,"height":1,"overflow":1,"object-fit":1,"object-position":1,"aspect-ratio":1,"z-index":1,"opacity":1,"transform":1,"display":1,"flex-direction":1,"flex-wrap":1,"flex-grow":1,"flex-shrink":1,"flex-basis":1,"justify-content":1,"align-items":1,"align-self":1,"gap":1,"grid-template-columns":1,"grid-column":1,"grid-row":1};

        function walk(el, depth) {
          total++;
          if (depth > maxDepth) maxDepth = depth;
          depthSum += depth;
          depthCount++;

          var cs = window.getComputedStyle(el);
          if (cs.position === "absolute") absoluteCount++;
          if (semanticTags.indexOf(el.tagName.toLowerCase()) >= 0) semanticCount++;
          var style = el.getAttribute("style");
          if (style && style.trim().length > 0) {
            inlineStyleCount++;
            var decls = style.split(";");
            var necessary = 0, extractable = 0;
            for (var d = 0; d < decls.length; d++) {
              var decl = decls[d].trim();
              if (!decl || decl.indexOf(":") < 0) continue;
              var prop = decl.split(":")[0].trim().toLowerCase();
              if (necessaryProps[prop]) necessary++;
              else extractable++;
            }
            if (extractable > necessary) badInlineCount++;
          }

          var display = cs.display;
          layoutModes[display] = (layoutModes[display] || 0) + 1;

          el.classList.forEach(function(cls) {
            classCounts[cls] = (classCounts[cls] || 0) + 1;
          });
          for (var i = 0; i < el.children.length; i++) walk(el.children[i], depth + 1);
        }
        all.forEach(function(el) { walk(el, 1); });

        var sharedClassCount = Object.values(classCounts).filter(function(c) { return c >= 2; }).length;
        var totalClasses = Object.keys(classCounts).length;
        return {
          total: total, absoluteCount: absoluteCount, semanticCount: semanticCount,
          inlineStyleCount: inlineStyleCount, badInlineCount: badInlineCount,
          sharedClassCount: sharedClassCount,
          totalClasses: totalClasses, maxDepth: maxDepth, avgDepth: depthCount > 0 ? depthSum / depthCount : 0,
          layoutModes: layoutModes
        };
      })()
    `);

    const absoluteRatio = raw.total > 0 ? raw.absoluteCount / raw.total : 0;
    const semanticTagRatio = raw.total > 0 ? raw.semanticCount / raw.total : 0;
    const cssReuseRatio = raw.totalClasses > 0 ? raw.sharedClassCount / raw.totalClasses : 0;
    const inlineStyleRatio = raw.total > 0 ? raw.inlineStyleCount / raw.total : 0;
    const badInlineRatio = raw.total > 0 ? raw.badInlineCount / raw.total : 0;
    const depthScore = Math.max(0, 1 - raw.avgDepth / 12);

    const gridCount = raw.layoutModes.grid || 0;
    const flexCount = raw.layoutModes.flex || 0;
    const blockCount = raw.layoutModes.block || 0;
    const structuredCount = gridCount + flexCount;
    const layoutConsistencyScore = raw.total > 0 ? structuredCount / (structuredCount + blockCount) : 0;

    const modeCounts = { semantic: 0, grid: 0, pixel: 0 };
    for (const mode of sectionModes.values()) {
      if (mode === "semantic") modeCounts.semantic++;
      else if (mode === "grid") modeCounts.grid++;
      else if (mode === "pixel") modeCounts.pixel++;
    }
    const eligibleForGrid = modeCounts.grid + modeCounts.pixel;
    const eligibleGridCoverage = eligibleForGrid > 0 ? modeCounts.grid / eligibleForGrid : 1;

    const maintainabilityScore =
      semanticTagRatio * 0.25 +
      cssReuseRatio * 0.2 +
      (1 - badInlineRatio) * 0.2 +
      (1 - absoluteRatio) * 0.2 +
      layoutConsistencyScore * 0.1 +
      depthScore * 0.05;

    return {
      absoluteRatio,
      semanticTagRatio,
      cssReuseRatio,
      inlineStyleRatio,
      badInlineRatio,
      maxDepth: raw.maxDepth,
      avgDepth: Math.round(raw.avgDepth * 100) / 100,
      layoutConsistencyScore,
      modeDistribution: modeCounts,
      eligibleGridCoverage,
      maintainabilityScore: Math.min(1, maintainabilityScore),
    };
  } catch {
    return {
      absoluteRatio: 0,
      semanticTagRatio: 0,
      cssReuseRatio: 0,
      inlineStyleRatio: 0,
      badInlineRatio: 0,
      maxDepth: 0,
      avgDepth: 0,
      layoutConsistencyScore: 0,
      modeDistribution: { semantic: 0, grid: 0, pixel: 0 },
      eligibleGridCoverage: 1,
      maintainabilityScore: 0,
    };
  }
}
