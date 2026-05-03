/**
 * 自动化优化引擎
 *
 * 功能：
 * 1. 自动截图对比（分段）
 * 2. 分析布局、字体、颜色差异
 * 3. 自动调整生成策略（Flex布局、占比、间距等）
 * 4. 迭代优化直到像素级还原
 * 5. 通用化设计，支持任意DSL
 */

import puppeteer, { type Browser } from "puppeteer";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { Section } from "../generators/section-splitter.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import { analyzeDSL } from "../generators/dsl-analyzer.js";
import { renderPageProgrammatic as renderPageProgrammaticLegacy } from "../generators/programmatic-section-renderer.legacy.js";

// ========== 类型定义 ==========

export type DiffAnalysis = {
  diffPercent: number;
  layoutIssues: LayoutIssue[];
  colorIssues: ColorIssue[];
  typographyIssues: TypographyIssue[];
  spacingIssues: SpacingIssue[];
};

export type LayoutIssue = {
  type: "width" | "height" | "position" | "alignment" | "flex-direction";
  severity: "critical" | "major" | "minor";
  description: string;
  suggestedFix: string;
};

export type ColorIssue = {
  type: "background" | "text" | "border";
  expected: string;
  actual: string;
  severity: "critical" | "major" | "minor";
  description: string;
};

export type TypographyIssue = {
  type: "font-size" | "font-weight" | "line-height" | "letter-spacing";
  expected: string;
  actual: string;
  severity: "critical" | "major" | "minor";
  description: string;
};

export type SpacingIssue = {
  type: "margin" | "padding" | "gap";
  direction: "top" | "right" | "bottom" | "left" | "all";
  expected: number;
  actual: number;
  severity: "critical" | "major" | "minor";
  description: string;
};

export type OptimizationStrategy = {
  useFlexbox: boolean;
  flexDirection: "row" | "column";
  justifyContent: string;
  alignItems: string;
  gap: number;
  proportions: number[];
};

export type OptimizationResult = {
  iteration: number;
  diffPercent: number;
  converged: boolean;
  strategy: OptimizationStrategy;
  appliedFixes: string[];
};

// ========== 主优化引擎 ==========

export class AutoOptimizer {
  private browser: Browser | null = null;
  private maxIterations: number;
  private targetDiffThreshold: number;
  private outputDir: string;

  constructor(options?: {
    maxIterations?: number;
    targetDiffThreshold?: number;
    outputDir?: string;
  }) {
    this.maxIterations = options?.maxIterations ?? 10;
    this.targetDiffThreshold = options?.targetDiffThreshold ?? 0.02;
    this.outputDir = options?.outputDir ?? "output";
  }

  async initialize() {
    console.log("[AutoOptimizer] 初始化 Puppeteer...");
    this.browser = await puppeteer.launch({ headless: true });
    console.log("[AutoOptimizer] ✓ Puppeteer 就绪");
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 主优化流程
   */
  async optimize(
    dsl: MachineDSL,
    sections: Section[],
    originalData: OriginalDslData | null,
  ): Promise<OptimizationResult[]> {
    if (!this.browser) await this.initialize();

    const baselinePath = join(this.outputDir, "design-baseline.png");
    if (!existsSync(baselinePath)) {
      throw new Error("设计稿 baseline 不存在: " + baselinePath);
    }

    console.log(`\n[AutoOptimizer] 开始自动优化 — ${sections.length} 个 Section`);
    console.log(`[AutoOptimizer] 目标差异阈值: ${(this.targetDiffThreshold * 100).toFixed(1)}%`);
    console.log(`[AutoOptimizer] 最大迭代次数: ${this.maxIterations}\n`);

    const results: OptimizationResult[] = [];
    const nodeMap = new Map<string, DSLNode>();
    for (const node of dsl.nodes) nodeMap.set(node.id, node);

    // 读取设计稿
    const baselineFull = PNG.sync.read(readFileSync(baselinePath));
    const pageWidth = dsl.page.width || 1440;

    // 逐 Section 优化
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log(`\n[AutoOptimizer] Section ${i + 1}/${sections.length}: ${section.name}`);

      const sectionResult = await this.optimizeSection(
        dsl,
        section,
        nodeMap,
        baselineFull,
        pageWidth,
        originalData,
      );

      results.push(sectionResult);

      if (sectionResult.converged) {
        console.log(`  ✓ 已收敛 (diff: ${(sectionResult.diffPercent * 100).toFixed(2)}%)`);
      } else {
        console.log(`  ⚠ 未收敛 (diff: ${(sectionResult.diffPercent * 100).toFixed(2)}%)`);
      }
    }

    return results;
  }

  /**
   * 优化单个 Section
   */
  private async optimizeSection(
    dsl: MachineDSL,
    section: Section,
    nodeMap: Map<string, DSLNode>,
    baselineFull: PNG,
    pageWidth: number,
    originalData: OriginalDslData | null,
  ): Promise<OptimizationResult> {
    const sectionRoot = nodeMap.get(section.nodeId);
    if (!sectionRoot) {
      throw new Error(`Section root node not found: ${section.nodeId}`);
    }

    // 获取 Section 在页面中的位置
    const sectionY = sectionRoot.layout.y ?? 0;
    const sectionHeight = typeof sectionRoot.layout.height === "number"
      ? sectionRoot.layout.height
      : 400;

    // 裁剪 baseline
    const baselineCrop = this.cropPNG(baselineFull, 0, sectionY, pageWidth, sectionHeight);

    let currentDSL = dsl;
    let currentDiff = 1.0;
    let previousDiff = 1.0;
    let iteration = 0;
    let converged = false;
    const appliedFixes: string[] = [];
    const diffHistory: number[] = [];
    let currentStrategy: OptimizationStrategy = {
      useFlexbox: true,
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "stretch",
      gap: 0,
      proportions: [],
    };

    // 迭代优化
    while (iteration < this.maxIterations && !converged) {
      iteration++;
      console.log(`  [Iteration ${iteration}/${this.maxIterations}]`);

      // 生成当前 HTML
      const dslAnalysis = analyzeDSL(currentDSL);
      const rendered = renderPageProgrammaticLegacy(currentDSL, [section], originalData, dslAnalysis);
      const fullHTML = this.assembleHTML(currentDSL, rendered.html, rendered.css);

      // 截图
      const screenshot = await this.screenshotSection(fullHTML, pageWidth, sectionY, sectionHeight);

      // 对比
      const analysis = this.analyzeDiff(baselineCrop, screenshot, sectionRoot, nodeMap);
      previousDiff = currentDiff;
      currentDiff = analysis.diffPercent;
      diffHistory.push(currentDiff);

      console.log(`    Diff: ${(currentDiff * 100).toFixed(2)}%`);

      // 检查是否收敛
      if (currentDiff <= this.targetDiffThreshold) {
        converged = true;
        console.log(`    ✓ 已达到目标阈值`);
        break;
      }

      // 震荡检测：如果差异没有改善或变差，可能陷入震荡
      if (iteration > 1 && currentDiff >= previousDiff * 0.95) {
        console.log(`    ⚠ 差异未改善 (${(previousDiff * 100).toFixed(2)}% → ${(currentDiff * 100).toFixed(2)}%)`);

        // 检查是否在震荡
        if (diffHistory.length >= 3) {
          const lastThree = diffHistory.slice(-3);
          const isOscillating = Math.max(...lastThree) - Math.min(...lastThree) < 0.01;

          if (isOscillating) {
            console.log(`    ⚠ 检测到震荡，停止迭代`);
            break;
          }
        }

        // 如果连续3次没有改善，停止
        if (iteration > 3) {
          const recentDiffs = diffHistory.slice(-3);
          const noImprovement = recentDiffs.every((d, i) => i === 0 || d >= recentDiffs[i - 1] * 0.95);

          if (noImprovement) {
            console.log(`    ⚠ 连续多次无改善，停止迭代`);
            break;
          }
        }
      }

      // 生成修复策略
      const fixes = this.generateFixes(analysis, sectionRoot, nodeMap);
      if (fixes.length === 0) {
        console.log(`    无可用修复策略，停止迭代`);
        break;
      }

      // 应用修复
      for (const fix of fixes) {
        currentDSL = this.applyFix(currentDSL, section.nodeId, fix);
        appliedFixes.push(fix.description);
        console.log(`    应用修复: ${fix.description}`);
      }

      // 更新策略
      const updatedRoot = currentDSL.nodes.find((n: DSLNode) => n.id === section.nodeId);
      if (updatedRoot) {
        currentStrategy = this.extractStrategy(updatedRoot);
      }
    }

    return {
      iteration,
      diffPercent: currentDiff,
      converged,
      strategy: currentStrategy,
      appliedFixes,
    };
  }

  /**
   * 分析差异
   */
  private analyzeDiff(
    baseline: PNG,
    screenshot: PNG,
    sectionRoot: DSLNode,
    nodeMap: Map<string, DSLNode>,
  ): DiffAnalysis {
    // 对齐尺寸
    const width = Math.max(baseline.width, screenshot.width);
    const height = Math.max(baseline.height, screenshot.height);
    const paddedBaseline = this.padPNG(baseline, width, height);
    const paddedScreenshot = this.padPNG(screenshot, width, height);

    // pixelmatch 对比
    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(
      paddedBaseline.data,
      paddedScreenshot.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 },
    );

    const diffPercent = diffPixels / (width * height);

    // 分析具体问题
    const layoutIssues = this.detectLayoutIssues(baseline, screenshot, sectionRoot, nodeMap);
    const colorIssues = this.detectColorIssues(paddedBaseline, paddedScreenshot, width, height);
    const typographyIssues = this.detectTypographyIssues(sectionRoot, nodeMap);
    const spacingIssues = this.detectSpacingIssues(sectionRoot, nodeMap);

    return {
      diffPercent,
      layoutIssues,
      colorIssues,
      typographyIssues,
      spacingIssues,
    };
  }

  /**
   * 检测布局问题
   */
  private detectLayoutIssues(
    baseline: PNG,
    screenshot: PNG,
    sectionRoot: DSLNode,
    nodeMap: Map<string, DSLNode>,
  ): LayoutIssue[] {
    const issues: LayoutIssue[] = [];

    // 宽度差异
    if (Math.abs(baseline.width - screenshot.width) > 10) {
      issues.push({
        type: "width",
        severity: "major",
        description: `宽度不匹配: baseline=${baseline.width}px, actual=${screenshot.width}px`,
        suggestedFix: `设置 width: ${baseline.width}px`,
      });
    }

    // 高度差异
    if (Math.abs(baseline.height - screenshot.height) > 10) {
      issues.push({
        type: "height",
        severity: "major",
        description: `高度不匹配: baseline=${baseline.height}px, actual=${screenshot.height}px`,
        suggestedFix: `调整内容高度或 padding`,
      });
    }

    // 检查子元素布局方向和占比
    const children = sectionRoot.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];
    if (children.length >= 2) {
      const isHorizontal = this.isHorizontalLayout(children);
      const currentDirection = sectionRoot.layout.direction || "column";

      if (isHorizontal && currentDirection === "column") {
        issues.push({
          type: "flex-direction",
          severity: "critical",
          description: "子元素应该水平排列，但当前是垂直布局",
          suggestedFix: "设置 flex-direction: row",
        });
      } else if (!isHorizontal && currentDirection === "row") {
        issues.push({
          type: "flex-direction",
          severity: "critical",
          description: "子元素应该垂直排列，但当前是水平布局",
          suggestedFix: "设置 flex-direction: column",
        });
      }
    }

    return issues;
  }

  /**
   * 检测颜色问题
   */
  private detectColorIssues(
    baseline: PNG,
    screenshot: PNG,
    width: number,
    height: number,
  ): ColorIssue[] {
    const issues: ColorIssue[] = [];

    // 提取主要颜色
    const baselineColors = this.extractDominantColors(baseline);
    const screenshotColors = this.extractDominantColors(screenshot);

    // 采样对比
    const samplePoints = 20;
    let colorDiffCount = 0;

    for (let i = 0; i < samplePoints; i++) {
      const x = Math.floor((width / samplePoints) * i);
      const y = Math.floor(height / 2);
      const idx = (width * y + x) << 2;

      const baseR = baseline.data[idx];
      const baseG = baseline.data[idx + 1];
      const baseB = baseline.data[idx + 2];

      const shotR = screenshot.data[idx];
      const shotG = screenshot.data[idx + 1];
      const shotB = screenshot.data[idx + 2];

      const colorDist = Math.sqrt(
        Math.pow(baseR - shotR, 2) +
        Math.pow(baseG - shotG, 2) +
        Math.pow(baseB - shotB, 2),
      );

      if (colorDist > 30) {
        colorDiffCount++;
      }
    }

    if (colorDiffCount > samplePoints * 0.3) {
      issues.push({
        type: "background",
        expected: baselineColors[0] || "未知",
        actual: screenshotColors[0] || "未知",
        severity: "major",
        description: `背景颜色差异较大 (${colorDiffCount}/${samplePoints} 采样点不匹配)`,
      });
    }

    // 对比主要颜色
    if (baselineColors.length > 0 && screenshotColors.length > 0) {
      const colorDist = this.colorDistance(baselineColors[0], screenshotColors[0]);
      if (colorDist > 50) {
        issues.push({
          type: "background",
          expected: baselineColors[0],
          actual: screenshotColors[0],
          severity: "major",
          description: `主要颜色不匹配: 期望 ${baselineColors[0]}, 实际 ${screenshotColors[0]}`,
        });
      }
    }

    return issues;
  }

  /**
   * 检测字体问题
   */
  private detectTypographyIssues(
    sectionRoot: DSLNode,
    nodeMap: Map<string, DSLNode>,
  ): TypographyIssue[] {
    const issues: TypographyIssue[] = [];
    const textNodes = this.collectTextNodes(sectionRoot, nodeMap);

    for (const node of textNodes) {
      const fontSize = node.style.fontSize;
      const fontWeight = node.style.fontWeight;

      // 检查字体大小是否合理
      if (fontSize && (fontSize < 10 || fontSize > 100)) {
        issues.push({
          type: "font-size",
          expected: "10-100px",
          actual: `${fontSize}px`,
          severity: "minor",
          description: `字体大小异常: ${fontSize}px`,
        });
      }

      // 检查字重
      if (fontWeight && fontWeight < 100) {
        issues.push({
          type: "font-weight",
          expected: "100-900",
          actual: `${fontWeight}`,
          severity: "minor",
          description: `字重异常: ${fontWeight}`,
        });
      }
    }

    return issues;
  }

  /**
   * 检测间距问题
   */
  private detectSpacingIssues(
    sectionRoot: DSLNode,
    nodeMap: Map<string, DSLNode>,
  ): SpacingIssue[] {
    const issues: SpacingIssue[] = [];
    const children = sectionRoot.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];

    if (children.length >= 2) {
      // 计算子元素间距
      const gaps: number[] = [];
      for (let i = 0; i < children.length - 1; i++) {
        const curr = children[i];
        const next = children[i + 1];

        const currBottom = (curr.layout.y ?? 0) + (curr.layout.height as number ?? 0);
        const nextTop = next.layout.y ?? 0;
        const gap = nextTop - currBottom;

        gaps.push(gap);
      }

      // 检查间距一致性
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const inconsistent = gaps.some(g => Math.abs(g - avgGap) > 5);

      if (inconsistent) {
        issues.push({
          type: "gap",
          direction: "all",
          expected: Math.round(avgGap),
          actual: Math.round(gaps[0]),
          severity: "minor",
          description: `子元素间距不一致，建议统一为 ${Math.round(avgGap)}px`,
        });
      }
    }

    return issues;
  }

  /**
   * 生成修复策略
   */
  private generateFixes(
    analysis: DiffAnalysis,
    sectionRoot: DSLNode,
    nodeMap: Map<string, DSLNode>,
  ): Array<{ type: string; description: string; payload: any; nodeId?: string }> {
    const fixes: Array<{ type: string; description: string; payload: any; nodeId?: string }> = [];

    // 布局修复（优先级最高）
    for (const issue of analysis.layoutIssues) {
      if (issue.type === "flex-direction" && issue.severity === "critical") {
        const newDirection = issue.suggestedFix.includes("row") ? "row" : "column";
        fixes.push({
          type: "update-layout",
          description: `调整布局方向为 ${newDirection}`,
          payload: { direction: newDirection, mode: "flex" },
        });
      }

      if (issue.type === "width" && issue.severity === "major") {
        const match = issue.suggestedFix.match(/width:\s*(\d+)px/);
        if (match) {
          fixes.push({
            type: "update-layout",
            description: `调整宽度为 ${match[1]}px`,
            payload: { width: parseInt(match[1]) },
          });
        }
      }
    }

    // 间距修复
    for (const issue of analysis.spacingIssues) {
      if (issue.type === "gap") {
        fixes.push({
          type: "update-layout",
          description: `统一子元素间距为 ${issue.expected}px`,
          payload: { gap: issue.expected },
        });
      }
    }

    // 颜色修复
    for (const issue of analysis.colorIssues) {
      if (issue.type === "background" && issue.expected !== "未知" && issue.expected !== "设计稿颜色") {
        fixes.push({
          type: "update-style",
          description: `调整背景颜色为 ${issue.expected}`,
          payload: { background: issue.expected },
        });
      }
    }

    // 字体修复
    for (const issue of analysis.typographyIssues) {
      if (issue.type === "font-size" && issue.severity !== "minor") {
        const match = issue.expected.match(/(\d+)-(\d+)px/);
        if (match) {
          const minSize = parseInt(match[1]);
          const maxSize = parseInt(match[2]);
          const currentSize = parseInt(issue.actual);
          const fixedSize = Math.max(minSize, Math.min(maxSize, currentSize));

          fixes.push({
            type: "update-style",
            description: `调整字体大小为 ${fixedSize}px`,
            payload: { fontSize: fixedSize },
          });
        }
      }
    }

    return fixes;
  }

  /**
   * 应用修复到 DSL
   */
  private applyFix(
    dsl: MachineDSL,
    nodeId: string,
    fix: { type: string; description: string; payload: any; nodeId?: string },
  ): MachineDSL {
    const newDSL = JSON.parse(JSON.stringify(dsl));
    const targetNodeId = fix.nodeId || nodeId;
    const node = newDSL.nodes.find((n: DSLNode) => n.id === targetNodeId);

    if (!node) return newDSL;

    if (fix.type === "update-style") {
      node.style = { ...node.style, ...fix.payload };
    } else if (fix.type === "update-layout") {
      node.layout = { ...node.layout, ...fix.payload };
    }

    return newDSL;
  }

  /**
   * 提取当前策略
   */
  private extractStrategy(node: DSLNode): OptimizationStrategy {
    return {
      useFlexbox: node.layout.mode === "flex",
      flexDirection: (node.layout.direction as "row" | "column") || "column",
      justifyContent: node.layout.justify || "flex-start",
      alignItems: node.layout.align || "stretch",
      gap: node.layout.gap || 0,
      proportions: [],
    };
  }

  /**
   * 组装完整HTML页面
   */
  private assembleHTML(dsl: MachineDSL, bodyHTML: string, css: string): string {
    const pageWidth = dsl.page.width || 1440;
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dsl.page.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    ${css}
  </style>
</head>
<body style="width: ${pageWidth}px; margin: 0 auto;">
  ${bodyHTML}
</body>
</html>`;
  }

  // ========== 工具方法 ==========

  /**
   * 截图指定 Section
   */
  private async screenshotSection(
    html: string,
    pageWidth: number,
    sectionY: number,
    sectionHeight: number,
  ): Promise<PNG> {
    if (!this.browser) throw new Error("Browser not initialized");

    const page = await this.browser.newPage();
    await page.setViewport({ width: pageWidth, height: 800 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    // 截取整页
    const screenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
    await page.close();

    const fullPNG = PNG.sync.read(screenshot);

    // 裁剪 Section 区域
    return this.cropPNG(fullPNG, 0, sectionY, pageWidth, sectionHeight);
  }

  /**
   * 裁剪 PNG
   */
  private cropPNG(src: PNG, x: number, y: number, w: number, h: number): PNG {
    const cx = Math.max(0, Math.round(x));
    const cy = Math.max(0, Math.round(y));
    const cw = Math.min(Math.round(w), src.width - cx);
    const ch = Math.min(Math.round(h), src.height - cy);

    if (cw <= 0 || ch <= 0) return new PNG({ width: 1, height: 1 });

    const out = new PNG({ width: cw, height: ch });
    for (let row = 0; row < ch; row++) {
      const srcOffset = ((cy + row) * src.width + cx) << 2;
      src.data.copy(out.data, row * cw * 4, srcOffset, srcOffset + cw * 4);
    }
    return out;
  }

  /**
   * 填充 PNG 到指定尺寸
   */
  private padPNG(src: PNG, width: number, height: number): PNG {
    if (src.width === width && src.height === height) return src;

    const out = new PNG({ width, height });
    for (let y = 0; y < Math.min(src.height, height); y++) {
      for (let x = 0; x < Math.min(src.width, width); x++) {
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

  /**
   * 判断是否为水平布局
   */
  private isHorizontalLayout(children: DSLNode[]): boolean {
    if (children.length < 2) return false;

    const first = children[0];
    const second = children[1];

    const firstRight = (first.layout.x ?? 0) + (first.layout.width as number ?? 0);
    const secondLeft = second.layout.x ?? 0;

    // 如果第二个元素在第一个元素右侧，则为水平布局
    return secondLeft >= firstRight - 10;
  }

  /**
   * 收集所有文本节点
   */
  private collectTextNodes(node: DSLNode, nodeMap: Map<string, DSLNode>): DSLNode[] {
    const textNodes: DSLNode[] = [];

    if (node.type === "text") {
      textNodes.push(node);
    }

    for (const childId of node.children) {
      const child = nodeMap.get(childId);
      if (child) {
        textNodes.push(...this.collectTextNodes(child, nodeMap));
      }
    }

    return textNodes;
  }

  /**
   * 计算子元素占比
   */
  private calculateProportions(children: DSLNode[], isHorizontal: boolean): number[] {
    if (children.length === 0) return [];

    const sizes = children.map(child => {
      if (isHorizontal) {
        return (child.layout.width as number) || 0;
      } else {
        return (child.layout.height as number) || 0;
      }
    });

    const total = sizes.reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return sizes.map(size => size / total);
  }

  /**
   * 从图像中提取主要颜色
   */
  private extractDominantColors(png: PNG, sampleCount: number = 50): string[] {
    const colors = new Map<string, number>();
    const step = Math.max(1, Math.floor(png.width * png.height / sampleCount));

    for (let i = 0; i < png.data.length; i += step * 4) {
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];

      if (a < 128) continue; // 跳过透明像素

      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      colors.set(hex, (colors.get(hex) || 0) + 1);
    }

    // 按出现频率排序
    return Array.from(colors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => color);
  }

  /**
   * 计算两个颜色之间的距离
   */
  private colorDistance(color1: string, color2: string): number {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    return Math.sqrt(
      Math.pow(r1 - r2, 2) +
      Math.pow(g1 - g2, 2) +
      Math.pow(b1 - b2, 2)
    );
  }
}

