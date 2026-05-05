/**
 * Layout Inference — 从绝对坐标反推 flex/grid 布局提示
 *
 * 用途: 为 pixel mode 的 section 生成布局优化建议
 * 输出: LayoutHint（推断的布局模式、列数、间距、置信度）
 */

import type { SectionManifest, NodeManifest } from "../generators/section-manifest.js";

export type LayoutHint = {
  sectionId: string;
  inferredMode: "grid" | "flex-row" | "flex-column" | "unknown";
  columnCount?: number;
  gapX?: number;
  gapY?: number;
  confidence: number;
};

const BIN_TOLERANCE = 10;

export function inferGridLayout(manifest: SectionManifest): LayoutHint {
  const children = manifest.children;
  if (children.length < 3) {
    return { sectionId: manifest.sectionId, inferredMode: "unknown", confidence: 0 };
  }

  // 按 x/y 分组
  const xGroups = groupByCoordinate(children, "x");
  const yGroups = groupByCoordinate(children, "y");

  const uniqueXCount = xGroups.size;
  const uniqueYCount = yGroups.size;

  // 多行多列 → grid
  if (uniqueXCount >= 2 && uniqueYCount >= 2) {
    const gapX = computeGap(xGroups, children, "x");
    const gapY = computeGap(yGroups, children, "y");
    const confidence = computeConfidence(children, xGroups, yGroups);
    return {
      sectionId: manifest.sectionId,
      inferredMode: "grid",
      columnCount: uniqueXCount,
      gapX,
      gapY,
      confidence,
    };
  }

  // 单行多列 → flex-row
  if (uniqueYCount === 1 && uniqueXCount >= 3) {
    const gapX = computeGap(xGroups, children, "x");
    return {
      sectionId: manifest.sectionId,
      inferredMode: "flex-row",
      columnCount: uniqueXCount,
      gapX,
      confidence: computeConfidence(children, xGroups, yGroups),
    };
  }

  // 单列多行 → flex-column
  if (uniqueXCount === 1 && uniqueYCount >= 3) {
    const gapY = computeGap(yGroups, children, "y");
    return {
      sectionId: manifest.sectionId,
      inferredMode: "flex-column",
      gapY,
      confidence: computeConfidence(children, xGroups, yGroups),
    };
  }

  return { sectionId: manifest.sectionId, inferredMode: "unknown", confidence: 0 };
}

function groupByCoordinate(
  children: NodeManifest[],
  axis: "x" | "y",
): Map<number, NodeManifest[]> {
  const groups = new Map<number, NodeManifest[]>();
  for (const child of children) {
    const bin = Math.round(child.relativeBounds[axis] / BIN_TOLERANCE) * BIN_TOLERANCE;
    if (!groups.has(bin)) groups.set(bin, []);
    groups.get(bin)!.push(child);
  }
  return groups;
}

function computeGap(
  groups: Map<number, NodeManifest[]>,
  children: NodeManifest[],
  axis: "x" | "y",
): number {
  const sortedBins = [...groups.keys()].sort((a, b) => a - b);
  if (sortedBins.length < 2) return 0;

  const otherAxis = axis === "x" ? "y" : "x";
  const gaps: number[] = [];

  for (let i = 0; i < sortedBins.length - 1; i++) {
    const currentGroup = groups.get(sortedBins[i])!;
    const nextGroup = groups.get(sortedBins[i + 1])!;

    const maxEdge = Math.max(...currentGroup.map(c =>
      c.relativeBounds[axis] + (axis === "x" ? c.relativeBounds.width : c.relativeBounds.height)
    ));
    const minStart = Math.min(...nextGroup.map(c => c.relativeBounds[axis]));
    const gap = minStart - maxEdge;
    if (gap > 0) gaps.push(gap);
  }

  return gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
}

function computeConfidence(
  children: NodeManifest[],
  xGroups: Map<number, NodeManifest[]>,
  yGroups: Map<number, NodeManifest[]>,
): number {
  // 尺寸一致性
  const heights = children.map(c => c.relativeBounds.height);
  const avgH = heights.reduce((a, b) => a + b, 0) / heights.length;
  const heightVariance = avgH > 0
    ? Math.max(...heights.map(h => Math.abs(h - avgH))) / avgH
    : 1;

  // 间距规律性
  const xBins = [...xGroups.keys()].sort((a, b) => a - b);
  const xGaps = xBins.length >= 2
    ? xBins.slice(1).map((b, i) => b - xBins[i]).filter(g => g > 0)
    : [];
  const xGapVariance = xGaps.length >= 2
    ? (() => {
        const avg = xGaps.reduce((a, b) => a + b, 0) / xGaps.length;
        return avg > 0 ? Math.max(...xGaps.map(g => Math.abs(g - avg))) / avg : 1;
      })()
    : 1;

  // 每组元素数均衡
  const groupSizes = [...xGroups.values()].map(g => g.length);
  const sizeVariance = groupSizes.length >= 2
    ? Math.max(...groupSizes) - Math.min(...groupSizes)
    : 0;
  const sizeBalance = 1 - Math.min(1, sizeVariance / Math.max(...groupSizes));

  // 综合
  const sizeScore = Math.max(0, 1 - heightVariance);
  const gapScore = Math.max(0, 1 - xGapVariance);

  return Math.min(1, (sizeScore * 0.3 + gapScore * 0.4 + sizeBalance * 0.3));
}
