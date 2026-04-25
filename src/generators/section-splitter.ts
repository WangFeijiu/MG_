/**
 * Section 识别和分块
 * 基于布局层级和间距自动识别页面 Section
 *
 * 策略：
 * 1. 从根节点向下递归，找到"合适的 Section 层级"
 * 2. 合适层级 = 节点有多个子节点，且子节点宽度与父节点接近
 * 3. 如果根的直接子节点太少（<3），继续向下查找
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";

export type Section = {
  id: string;
  name: string;
  nodeId: string;
  nodeIds: string[];
  complexity: number;
};

const MIN_SECTIONS = 3;

export function splitSections(dsl: MachineDSL): Section[] {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const rootNode = nodeMap.get(dsl.page.id);
  if (!rootNode) return [];

  // 递归查找最佳 Section 分层
  const sections = findBestSectionLevel(rootNode, nodeMap);

  if (sections.length === 0) {
    const allIds = collectDescendantIds(rootNode, nodeMap);
    return [{
      id: "section-0",
      name: rootNode.name || "Page",
      nodeId: rootNode.id,
      nodeIds: [rootNode.id, ...allIds],
      complexity: computeComplexity(rootNode, nodeMap),
    }];
  }

  return sections;
}

/**
 * 递归查找最佳 Section 层级
 * 如果当前层的子节点数 >= MIN_SECTIONS，就用当前层的子节点作为 Sections
 * 否则向下深入
 */
function findBestSectionLevel(root: DSLNode, nodeMap: Map<string, DSLNode>): Section[] {
  const rootWidth = typeof root.layout.width === "number" ? root.layout.width : 0;

  // 收集当前层的有效子节点（有宽度、有子节点的容器）
  const candidates = root.children
    .map(id => nodeMap.get(id))
    .filter((n): n is DSLNode => !!n && n.children.length >= 0);

  // 如果候选数量够多，直接作为 Sections
  if (candidates.length >= MIN_SECTIONS) {
    return candidates.map((child, idx) => {
      const descendantIds = collectDescendantIds(child, nodeMap);
      return {
        id: `section-${idx}`,
        name: child.name || `Section ${idx + 1}`,
        nodeId: child.id,
        nodeIds: [child.id, ...descendantIds],
        complexity: computeComplexity(child, nodeMap),
      };
    });
  }

  // 候选太少，尝试向下深入 — 找子节点中子孙最多的那个，深入它
  if (candidates.length > 0) {
    // 尝试每个候选的子节点作为 Section
    for (const candidate of candidates) {
      const grandChildren = candidate.children
        .map(id => nodeMap.get(id))
        .filter((n): n is DSLNode => !!n);

      if (grandChildren.length >= MIN_SECTIONS) {
        return grandChildren.map((gc, idx) => {
          const descendantIds = collectDescendantIds(gc, nodeMap);
          return {
            id: `section-${idx}`,
            name: gc.name || `Section ${idx + 1}`,
            nodeId: gc.id,
            nodeIds: [gc.id, ...descendantIds],
            complexity: computeComplexity(gc, nodeMap),
          };
        });
      }
    }

    // 继续递归深入
    for (const candidate of candidates) {
      const result = findBestSectionLevel(candidate, nodeMap);
      if (result.length >= MIN_SECTIONS) return result;
    }
  }

  // 实在找不到合适的层级，把每个有内容的子节点作为 Section
  if (candidates.length >= 2) {
    return candidates.map((child, idx) => {
      const descendantIds = collectDescendantIds(child, nodeMap);
      return {
        id: `section-${idx}`,
        name: child.name || `Section ${idx + 1}`,
        nodeId: child.id,
        nodeIds: [child.id, ...descendantIds],
        complexity: computeComplexity(child, nodeMap),
      };
    });
  }

  return [];
}

function collectDescendantIds(node: DSLNode, nodeMap: Map<string, DSLNode>): string[] {
  const ids: string[] = [];
  for (const childId of node.children) {
    ids.push(childId);
    const child = nodeMap.get(childId);
    if (child) ids.push(...collectDescendantIds(child, nodeMap));
  }
  return ids;
}

function computeComplexity(node: DSLNode, nodeMap: Map<string, DSLNode>): number {
  let nodeCount = 0;
  let maxDepth = 0;
  const styleSet = new Set<string>();
  let interactiveCount = 0;

  function traverse(n: DSLNode, depth: number): void {
    nodeCount++;
    if (depth > maxDepth) maxDepth = depth;
    const styleKeys = Object.keys(n.style).filter(k => (n.style as any)[k] !== undefined && (n.style as any)[k] !== null);
    styleKeys.forEach(k => styleSet.add(k));
    if (n.type === "button") interactiveCount++;
    for (const childId of n.children) {
      const child = nodeMap.get(childId);
      if (child) traverse(child, depth + 1);
    }
  }

  traverse(node, 0);
  return nodeCount * 0.3 + maxDepth * 0.2 + styleSet.size * 0.2 + interactiveCount * 0.3;
}
