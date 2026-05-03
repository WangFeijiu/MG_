/**
 * 视觉差异分析器
 *
 * 通过像素级对比，精确定位差异区域，并映射到DSL节点
 */

import type { PNG } from "pngjs";
import type { DSLNode } from "../types/machine-dsl.js";

export type DiffRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPercent: number;
  affectedNodes: string[]; // 节点ID列表
};

export type VisualDiffResult = {
  totalDiffPercent: number;
  regions: DiffRegion[];
  heatmap: number[][]; // 差异热力图
};

/**
 * 分析两张图片的视觉差异，并生成差异热力图
 */
export function analyzeVisualDiff(
  baseline: PNG,
  screenshot: PNG,
  gridSize: number = 20,
): VisualDiffResult {
  const width = Math.min(baseline.width, screenshot.width);
  const height = Math.min(baseline.height, screenshot.height);

  // 创建差异热力图
  const gridW = Math.ceil(width / gridSize);
  const gridH = Math.ceil(height / gridSize);
  const heatmap: number[][] = Array(gridH).fill(0).map(() => Array(gridW).fill(0));

  let totalDiff = 0;
  let totalPixels = 0;

  // 计算每个网格的差异
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const startX = gx * gridSize;
      const startY = gy * gridSize;
      const endX = Math.min(startX + gridSize, width);
      const endY = Math.min(startY + gridSize, height);

      let gridDiff = 0;
      let gridPixels = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (width * y + x) << 2;

          const r1 = baseline.data[idx];
          const g1 = baseline.data[idx + 1];
          const b1 = baseline.data[idx + 2];

          const r2 = screenshot.data[idx];
          const g2 = screenshot.data[idx + 1];
          const b2 = screenshot.data[idx + 2];

          const colorDist = Math.sqrt(
            Math.pow(r1 - r2, 2) +
            Math.pow(g1 - g2, 2) +
            Math.pow(b1 - b2, 2)
          );

          if (colorDist > 30) {
            gridDiff++;
          }
          gridPixels++;
        }
      }

      const gridDiffPercent = gridPixels > 0 ? gridDiff / gridPixels : 0;
      heatmap[gy][gx] = gridDiffPercent;
      totalDiff += gridDiff;
      totalPixels += gridPixels;
    }
  }

  // 识别差异区域
  const regions = identifyDiffRegions(heatmap, gridSize, 0.1);

  return {
    totalDiffPercent: totalPixels > 0 ? totalDiff / totalPixels : 0,
    regions,
    heatmap,
  };
}

/**
 * 从热力图中识别连续的差异区域
 */
function identifyDiffRegions(
  heatmap: number[][],
  gridSize: number,
  threshold: number,
): DiffRegion[] {
  const regions: DiffRegion[] = [];
  const visited = new Set<string>();

  for (let y = 0; y < heatmap.length; y++) {
    for (let x = 0; x < heatmap[y].length; x++) {
      const key = `${x},${y}`;
      if (visited.has(key) || heatmap[y][x] < threshold) continue;

      // BFS找连续区域
      const region = floodFill(heatmap, x, y, threshold, visited);
      if (region.cells.length > 0) {
        const minX = Math.min(...region.cells.map(c => c.x));
        const maxX = Math.max(...region.cells.map(c => c.x));
        const minY = Math.min(...region.cells.map(c => c.y));
        const maxY = Math.max(...region.cells.map(c => c.y));

        regions.push({
          x: minX * gridSize,
          y: minY * gridSize,
          width: (maxX - minX + 1) * gridSize,
          height: (maxY - minY + 1) * gridSize,
          diffPercent: region.avgDiff,
          affectedNodes: [],
        });
      }
    }
  }

  return regions;
}

function floodFill(
  heatmap: number[][],
  startX: number,
  startY: number,
  threshold: number,
  visited: Set<string>,
): { cells: Array<{ x: number; y: number }>; avgDiff: number } {
  const cells: Array<{ x: number; y: number }> = [];
  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let totalDiff = 0;

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (y < 0 || y >= heatmap.length || x < 0 || x >= heatmap[y].length) continue;
    if (heatmap[y][x] < threshold) continue;

    visited.add(key);
    cells.push({ x, y });
    totalDiff += heatmap[y][x];

    // 检查4个方向
    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }

  return {
    cells,
    avgDiff: cells.length > 0 ? totalDiff / cells.length : 0,
  };
}

/**
 * 将差异区域映射到DSL节点
 */
export function mapRegionsToNodes(
  regions: DiffRegion[],
  nodes: DSLNode[],
  sectionY: number,
): DiffRegion[] {
  return regions.map(region => {
    const affectedNodes: string[] = [];

    for (const node of nodes) {
      const nodeX = node.layout.x ?? 0;
      const nodeY = (node.layout.y ?? 0) - sectionY;
      const nodeW = (node.layout.width as number) ?? 0;
      const nodeH = (node.layout.height as number) ?? 0;

      // 检查节点是否与差异区域重叠
      if (
        nodeX < region.x + region.width &&
        nodeX + nodeW > region.x &&
        nodeY < region.y + region.height &&
        nodeY + nodeH > region.y
      ) {
        affectedNodes.push(node.id);
      }
    }

    return {
      ...region,
      affectedNodes,
    };
  });
}
