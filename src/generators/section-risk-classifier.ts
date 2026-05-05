/**
 * Section 风险分类器 — 根据复杂度决定生成模式
 *
 * A. semantic mode: LLM 语义化生成（小区块）
 * B. grid mode: 程序生成 grid 布局 + LLM 填语义（重复卡片）
 * C. pixel mode: 程序绝对还原（大区块/高风险）
 *
 * v11.1: 置信度评分 + 误判保护
 */

import type { DSLNode } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";

export type GenerationMode = "semantic" | "grid" | "pixel";

export type SectionRisk = {
  sectionId: string;
  mode: GenerationMode;
  reason: string;
};

export type GridConfidenceResult = {
  isGrid: boolean;
  confidence: number;
  reason: string[];
  columnCount: number;
  rowCount: number;
  gapX?: number;
  gapY?: number;
};

const PIXEL_HEIGHT_THRESHOLD = 1200;
const PIXEL_NODE_THRESHOLD = 50;
const GRID_MIN_ITEMS = 3;
const GRID_CONFIDENCE_THRESHOLD = 0.75;

export function classifySectionRisk(
  section: Section,
  nodeMap: Map<string, DSLNode>,
): SectionRisk {
  const root = nodeMap.get(section.nodeId);
  if (!root) return { sectionId: section.nodeId, mode: "semantic", reason: "no root" };

  const height = typeof root.layout.height === "number" ? root.layout.height : 0;
  const nodeCount = section.nodeIds.length;

  // 重复卡片 → grid mode (优先于 pixel 判定)
  const children = getValidChildren(root, nodeMap);
  if (children.length >= GRID_MIN_ITEMS) {
    const gridResult = assessGridConfidence(children, nodeMap);
    if (gridResult.isGrid) {
      return {
        sectionId: section.nodeId,
        mode: "grid",
        reason: `${children.length} 个重复卡片, confidence=${gridResult.confidence.toFixed(2)} (${gridResult.columnCount}x${gridResult.rowCount})`,
      };
    }
  }

  // 大区块 + 节点多 → pixel mode
  if (height > PIXEL_HEIGHT_THRESHOLD && nodeCount > PIXEL_NODE_THRESHOLD) {
    return { sectionId: section.nodeId, mode: "pixel", reason: `大区块 h=${height}px, ${nodeCount} nodes` };
  }

  // 超大区块（不管节点数）
  if (height > PIXEL_HEIGHT_THRESHOLD * 1.5) {
    return { sectionId: section.nodeId, mode: "pixel", reason: `超大区块 h=${height}px` };
  }

  // 大区块但节点不算太多 → grid (可能需要拆分子布局)
  if (height > PIXEL_HEIGHT_THRESHOLD) {
    return { sectionId: section.nodeId, mode: "grid", reason: `大区块 h=${height}px, grid 拆分` };
  }

  // 默认 → semantic mode
  return { sectionId: section.nodeId, mode: "semantic", reason: `小区块 h=${height}px, ${nodeCount} nodes` };
}

// ========== Grid 置信度评估 ==========

export function assessGridConfidence(
  children: DSLNode[],
  nodeMap: Map<string, DSLNode>,
): GridConfidenceResult {
  const reasons: string[] = [];

  // 基本门槛
  if (children.length < GRID_MIN_ITEMS) {
    return { isGrid: false, confidence: 0, reason: ["子节点不足 3 个"], columnCount: 0, rowCount: 0 };
  }

  // ---- 误判保护 ----

  // 1. Hero 区块保护
  if (hasHeroLikeComposition(children)) {
    return { isGrid: false, confidence: 0, reason: ["Hero 区块误判保护"], columnCount: 0, rowCount: 0 };
  }

  // 2. 大重叠保护
  if (hasLargeOverlap(children)) {
    reasons.push("overlap-warning");
  }

  // ---- 布局分析 ----

  const widths = children.map(c => typeof c.layout.width === "number" ? c.layout.width : 0);
  const heights = children.map(c => typeof c.layout.height === "number" ? c.layout.height : 0);
  const xPositions = children.map(c => c.layout.x ?? 0);
  const yPositions = children.map(c => c.layout.y ?? 0);

  // 列检测：按 x 分组 (10px 容差)
  const xBins = binCoordinates(xPositions, 10);
  const columnCount = xBins.size;

  // 行检测：按 y 分组 (10px 容差)
  const yBins = binCoordinates(yPositions, 10);
  const rowCount = yBins.size;

  if (columnCount < 2) {
    return { isGrid: false, confidence: 0, reason: ["只有 1 列，非 grid"], columnCount: 1, rowCount };
  }

  // ---- 四维评分 ----

  // 1. 尺寸相似度 (0-1)
  const sizeSimilarity = computeSizeSimilarity(widths, heights);

  // 2. 结构相似度 (0-1) — 找 dominant 签名
  const structureSimilarity = computeStructureSimilarity(children, nodeMap);

  // 3. 间距一致性 (0-1)
  const gapConsistency = computeGapConsistency(xPositions, yPositions, widths, heights, children);

  // 4. 对齐得分 (0-1)
  const alignmentScore = computeAlignmentScore(xBins, yBins, xPositions, yPositions);

  const confidence =
    sizeSimilarity * 0.3 +
    structureSimilarity * 0.3 +
    gapConsistency * 0.25 +
    alignmentScore * 0.15;

  // 计算 gap
  const gapX = computeGapX(xPositions, widths, 10);
  const gapY = computeGapY(yPositions, heights, 10);

  reasons.push(`size=${sizeSimilarity.toFixed(2)}, struct=${structureSimilarity.toFixed(2)}, gap=${gapConsistency.toFixed(2)}, align=${alignmentScore.toFixed(2)}`);

  return {
    isGrid: confidence >= GRID_CONFIDENCE_THRESHOLD && columnCount >= 2,
    confidence,
    reason: reasons,
    columnCount,
    rowCount,
    gapX,
    gapY,
  };
}

// ========== 误判保护函数 ==========

function hasHeroLikeComposition(children: DSLNode[]): boolean {
  // Hero: 一个超大元素（图片/视频）+ 一个文字块，两列但不是 grid
  const hasLargeImage = children.some(c =>
    c.type === "image" &&
    typeof c.layout.width === "number" && c.layout.width > 400 &&
    typeof c.layout.height === "number" && c.layout.height > 300
  );

  // 检查是否有大标题（fontSize >= 40 从子节点推断）
  const hasLargeText = children.some(c =>
    c.type === "text" &&
    typeof c.layout.width === "number" && c.layout.width > 300 &&
    typeof c.layout.height === "number" && c.layout.height > 100
  );

  return hasLargeImage && hasLargeText && children.length <= 4;
}

function hasLargeOverlap(children: DSLNode[]): boolean {
  let overlapCount = 0;
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i], b = children[j];
      const ax = a.layout.x ?? 0, ay = a.layout.y ?? 0;
      const aw = typeof a.layout.width === "number" ? a.layout.width : 0;
      const ah = typeof a.layout.height === "number" ? a.layout.height : 0;
      const bx = b.layout.x ?? 0, by = b.layout.y ?? 0;
      const bw = typeof b.layout.width === "number" ? b.layout.width : 0;
      const bh = typeof b.layout.height === "number" ? b.layout.height : 0;

      const overlapX = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
      const overlapY = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
      const areaA = aw * ah;
      if (areaA > 0 && overlapX * overlapY / areaA > 0.3) overlapCount++;
    }
  }
  return overlapCount > children.length * 0.3;
}

// ========== 评分函数 ==========

function computeSizeSimilarity(widths: number[], heights: number[]): number {
  const validW = widths.filter(w => w > 0);
  const validH = heights.filter(h => h > 0);
  if (validW.length < 2 && validH.length < 2) return 0;

  const wScore = validW.length >= 2 ? computeUniformity(validW) : 0.5;
  const hScore = validH.length >= 2 ? computeUniformity(validH) : 0.5;
  return wScore * 0.5 + hScore * 0.5;
}

function computeStructureSimilarity(children: DSLNode[], nodeMap: Map<string, DSLNode>): number {
  const sigs = children.map(c => {
    const childTypes = c.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(n => n!.type)
      .sort()
      .join(",");
    return `${c.type}:${c.children.length}:[${childTypes}]`;
  });

  const sigCounts = new Map<string, number>();
  for (const s of sigs) sigCounts.set(s, (sigCounts.get(s) || 0) + 1);

  let maxCount = 0;
  for (const count of sigCounts.values()) if (count > maxCount) maxCount = count;

  return maxCount / sigs.length;
}

function computeGapConsistency(
  xPositions: number[], yPositions: number[],
  widths: number[], heights: number[],
  children: DSLNode[],
): number {
  const gapXScore = computeGapAxisScore(xPositions, widths);
  const gapYScore = computeGapAxisScore(yPositions, heights);
  return gapXScore * 0.5 + gapYScore * 0.5;
}

function computeGapAxisScore(positions: number[], sizes: number[]): number {
  // 按 position 排序，计算相邻元素的间距
  const indexed = positions.map((p, i) => ({ pos: p, size: sizes[i] }))
    .filter(item => item.size > 0 && item.pos !== undefined)
    .sort((a, b) => a.pos - b.pos);

  if (indexed.length < 2) return 0;

  const gaps: number[] = [];
  for (let i = 0; i < indexed.length - 1; i++) {
    const gap = indexed[i + 1].pos - (indexed[i].pos + indexed[i].size);
    gaps.push(gap);
  }

  if (gaps.length === 0) return 0;

  // 间距一致性：方差越小越好
  const uniformity = computeUniformity(gaps.filter(g => g >= -5));
  return uniformity;
}

function computeAlignmentScore(
  xBins: Map<number, number[]>,
  yBins: Map<number, number[]>,
  xPositions: number[],
  yPositions: number[],
): number {
  // 对齐得分：同一列/行的元素数量是否均衡
  const xGroupSizes = [...xBins.values()].map(g => g.length);
  const yGroupSizes = [...yBins.values()].map(g => g.length);

  const xBalance = xGroupSizes.length >= 2 ? computeUniformity(xGroupSizes) : 1;
  const yBalance = yGroupSizes.length >= 2 ? computeUniformity(yGroupSizes) : 1;

  return xBalance * 0.5 + yBalance * 0.5;
}

// ========== 工具 ==========

function binCoordinates(values: number[], tolerance: number): Map<number, number[]> {
  const bins = new Map<number, number[]>();
  for (let i = 0; i < values.length; i++) {
    const bin = Math.round(values[i] / tolerance) * tolerance;
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin)!.push(i);
  }
  return bins;
}

function computeUniformity(values: number[]): number {
  if (values.length < 2) return 1;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg === 0) return 0;
  const maxDeviation = Math.max(...values.map(v => Math.abs(v - avg)));
  return Math.max(0, 1 - maxDeviation / avg);
}

function computeGapX(xPositions: number[], widths: number[], tolerance: number): number {
  const bins = binCoordinates(xPositions, tolerance);
  const sortedBins = [...bins.keys()].sort((a, b) => a - b);
  if (sortedBins.length < 2) return 0;

  const gaps: number[] = [];
  for (let i = 0; i < sortedBins.length - 1; i++) {
    const rightEdge = Math.max(...bins.get(sortedBins[i])!.map(idx => xPositions[idx] + widths[idx]));
    const leftEdge = Math.min(...bins.get(sortedBins[i + 1])!.map(idx => xPositions[idx]));
    const gap = leftEdge - rightEdge;
    if (gap > 0) gaps.push(gap);
  }
  return gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
}

function computeGapY(yPositions: number[], heights: number[], tolerance: number): number {
  const bins = binCoordinates(yPositions, tolerance);
  const sortedBins = [...bins.keys()].sort((a, b) => a - b);
  if (sortedBins.length < 2) return 0;

  const gaps: number[] = [];
  for (let i = 0; i < sortedBins.length - 1; i++) {
    const bottomEdge = Math.max(...bins.get(sortedBins[i])!.map(idx => yPositions[idx] + heights[idx]));
    const topEdge = Math.min(...bins.get(sortedBins[i + 1])!.map(idx => yPositions[idx]));
    const gap = topEdge - bottomEdge;
    if (gap > 0) gaps.push(gap);
  }
  return gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
}

function getValidChildren(node: DSLNode, nodeMap: Map<string, DSLNode>): DSLNode[] {
  return node.children
    .map(id => nodeMap.get(id))
    .filter((n): n is DSLNode => {
      if (!n) return false;
      const h = typeof n.layout.height === "number" ? n.layout.height : 0;
      const w = typeof n.layout.width === "number" ? n.layout.width : 0;
      return h >= 20 && w >= 20;
    });
}
