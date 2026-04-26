/**
 * Section 识别和分块（v4 — 两阶段策略）
 *
 * 策略：
 * Phase 1: 从根节点向下穿透 wrapper 容器，找到直系子节点 ≥ 2 的层级
 *          每个直系子节点天然成为一个 Section 候选（navbar、hero、content、footer）
 * Phase 2: 对过大的候选节点（height > 1200px）递归拆分
 *          - 列表容器（相似子节点）不拆
 *          - 按间距拆分
 *          - 按 Y 坐标 gap 拆分
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";

export type Section = {
  id: string;
  name: string;
  nodeId: string;
  nodeIds: string[];
  complexity: number;
};

const MIN_GAP_FOR_SPLIT = 200;     // y 间距超过 200px 才视为 Section 边界
const MAX_SECTION_HEIGHT = 1200;   // 单 Section 高度上限
const LIST_HEIGHT_VARIANCE = 0.5;  // 列表项高度差异阈值（50%）
const HEADER_NODE_THRESHOLD = 5;   // 小于此节点数的视为 header/title
const MIN_LIST_ITEMS = 3;          // 列表容器最小项数

let _sectionIdCounter = 0;
function nextSectionId(): string {
  return `section-${_sectionIdCounter++}`;
}

export function splitSections(dsl: MachineDSL): Section[] {
  _sectionIdCounter = 0;
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const rootNode = nodeMap.get(dsl.page.id);
  if (!rootNode) return [];

  // Phase 1: 穿透 wrapper，找到页面的直系子节点层级
  const pageChildren = descendToPageBody(rootNode, nodeMap);

  if (pageChildren.length === 0) {
    const allIds = collectDescendantIds(rootNode, nodeMap);
    return [{
      id: nextSectionId(),
      name: deriveSectionName(rootNode, nodeMap) || rootNode.name || "Page",
      nodeId: rootNode.id,
      nodeIds: [rootNode.id, ...allIds],
      complexity: computeComplexity(rootNode, nodeMap),
    }];
  }

  // Phase 2: 每个直系子节点作为 section 候选，过大的递归拆分
  const sections: Section[] = [];
  for (const child of pageChildren) {
    sections.push(...expandSection(child, nodeMap));
  }

  // Phase 3: 合并小 header 到相邻 section
  const merged = mergeOrphanHeaders(sections, nodeMap);

  // 分配最终 id
  return merged.map((sec, idx) => ({
    ...sec,
    id: `section-${idx}`,
  }));
}

/**
 * Phase 1: 从根节点向下穿透单子节点的 wrapper 容器
 * 直到找到一个有 ≥ 2 个有效子节点的层级
 *
 * 例: root → wrapper → wrapper → [navbar, content]
 *                           ↑ 停在这里，返回 [navbar, content]
 */
function descendToPageBody(node: DSLNode, nodeMap: Map<string, DSLNode>): DSLNode[] {
  const children = getValidChildren(node, nodeMap);

  if (children.length >= 2) {
    return children;
  }

  // 单子节点：继续向下穿透
  if (children.length === 1) {
    return descendToPageBody(children[0], nodeMap);
  }

  return [];
}

/**
 * Phase 2: 展开一个 section 候选
 * - 小节点直接成为 section
 * - 大节点尝试拆分
 */
function expandSection(node: DSLNode, nodeMap: Map<string, DSLNode>): Section[] {
  const nodeHeight = typeof node.layout.height === "number" ? node.layout.height : 0;

  // 小 section 直接保留（navbar h=70, CTA h=208, footer 等）
  if (nodeHeight <= MAX_SECTION_HEIGHT) {
    return [nodeToSection(node, nodeMap)];
  }

  // 大 section：尝试拆分
  return trySplitNode(node, nodeMap);
}

/**
 * 尝试将一个过大的节点拆分成多个 section
 */
function trySplitNode(node: DSLNode, nodeMap: Map<string, DSLNode>): Section[] {
  const children = getValidChildren(node, nodeMap);
  const nodeHeight = typeof node.layout.height === "number" ? node.layout.height : 0;

  // 单子节点 wrapper → 直接穿透
  if (children.length === 1) {
    return trySplitNode(children[0], nodeMap);
  }

  // 列表容器：子节点高度/结构相似 → 不拆分（如 3 个 feature cards）
  if (children.length >= MIN_LIST_ITEMS && isListContainer(children)) {
    return [nodeToSection(node, nodeMap)];
  }

  // 子节点 ≥ 3 且不是列表容器 → 每个子节点展开
  if (children.length >= MIN_LIST_ITEMS) {
    return expandEachChild(children, nodeMap);
  }

  // 2 个子节点：先看 gap
  if (children.length === 2) {
    const splitByGap = splitByVerticalGap(children, nodeMap);
    if (splitByGap.length > 1) {
      return splitByGap;
    }
  }

  // 节点仍然太高 → 检查孙子层
  if (nodeHeight > MAX_SECTION_HEIGHT && children.length >= 2) {
    // 若孙节点构成列表容器 → 在子节点层拆分（保持列表组完整）
    let anyListContainer = false;
    for (const child of children) {
      const grandChildren = getValidChildren(child, nodeMap);
      if (grandChildren.length >= MIN_LIST_ITEMS && isListContainer(grandChildren)) {
        anyListContainer = true;
        break;
      }
    }
    if (anyListContainer) {
      return expandEachChild(children, nodeMap);
    }

    // 尝试在孙子层拆分
    for (const child of children) {
      const grandChildren = getValidChildren(child, nodeMap);
      if (grandChildren.length >= MIN_LIST_ITEMS) {
        return expandEachChild(grandChildren, nodeMap);
      }
    }

    // 兜底：在子节点层拆分
    return expandEachChild(children, nodeMap);
  }

  return [nodeToSection(node, nodeMap)];
}

/**
 * 对每个子节点尝试展开（大节点拆分，小节点保留）
 */
function expandEachChild(candidates: DSLNode[], nodeMap: Map<string, DSLNode>): Section[] {
  const results: Section[] = [];

  for (const candidate of candidates) {
    const nodeHeight = typeof candidate.layout.height === "number" ? candidate.layout.height : 0;

    // 小节点直接成为 section
    if (nodeHeight <= MAX_SECTION_HEIGHT) {
      results.push(nodeToSection(candidate, nodeMap));
      continue;
    }

    // 大节点递归拆分
    const subSections = trySplitNode(candidate, nodeMap);
    if (subSections.length > 1) {
      results.push(...subSections);
    } else {
      results.push(nodeToSection(candidate, nodeMap));
    }
  }

  return results;
}

/**
 * 列表容器判断：子节点高度相似、结构相似 → 视为列表项（steps/cards/items）
 */
function isListContainer(children: DSLNode[]): boolean {
  if (children.length < MIN_LIST_ITEMS) return false;

  const heights = children.map(c => typeof c.layout.height === "number" ? c.layout.height : 0).filter(h => h > 0);
  if (heights.length < MIN_LIST_ITEMS) return false;

  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
  const maxHeight = Math.max(...heights);
  const minHeight = Math.min(...heights);

  if ((maxHeight - minHeight) / avgHeight > LIST_HEIGHT_VARIANCE) return false;

  const typeSignatures = children.map(c => getTypeSignature(c));
  const firstSig = typeSignatures[0];
  const similarCount = typeSignatures.filter(sig => sig === firstSig).length;

  return similarCount / typeSignatures.length >= 0.7;
}

function getTypeSignature(node: DSLNode): string {
  return `${node.type}:${node.children.length}`;
}

/**
 * 合并孤儿 header：如果一个 section 节点数很少（< 5）且高度小
 * 合并到相邻的内容 section 中
 */
function mergeOrphanHeaders(sections: Section[], nodeMap: Map<string, DSLNode>): Section[] {
  const result: Section[] = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];

    const root = nodeMap.get(sec.nodeId);
    const isHeader = sec.nodeIds.length <= HEADER_NODE_THRESHOLD &&
      root && (typeof root.layout.height === "number" ? root.layout.height : 0) < 100;

    if (isHeader && result.length > 0) {
      const prev = result[result.length - 1];
      prev.nodeIds.push(...sec.nodeIds);
      prev.complexity += sec.complexity;
    } else if (isHeader && result.length === 0 && i < sections.length - 1) {
      const next = sections[i + 1];
      next.nodeIds.unshift(...sec.nodeIds);
      next.complexity += sec.complexity;
      result.push(next);
      i++;
    } else {
      result.push({ ...sec });
    }
  }

  return result;
}

function splitByVerticalGap(children: DSLNode[], nodeMap: Map<string, DSLNode>): Section[] {
  if (children.length < 2) return [];

  const sorted = [...children].sort((a, b) => (a.layout.y ?? 0) - (b.layout.y ?? 0));

  if (isListContainer(sorted)) return [];

  let hasLargeGap = false;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevBottom = (prev.layout.y ?? 0) + (typeof prev.layout.height === "number" ? prev.layout.height : 0);
    const currTop = curr.layout.y ?? 0;
    const gap = currTop - prevBottom;
    if (gap > MIN_GAP_FOR_SPLIT) {
      hasLargeGap = true;
      break;
    }
  }

  if (!hasLargeGap) return [];

  return sorted.map(child => nodeToSection(child, nodeMap));
}

function getValidChildren(node: DSLNode, nodeMap: Map<string, DSLNode>): DSLNode[] {
  return node.children
    .map(id => nodeMap.get(id))
    .filter((n): n is DSLNode => {
      if (!n) return false;
      const h = typeof n.layout.height === "number" ? n.layout.height : 0;
      const w = typeof n.layout.width === "number" ? n.layout.width : 0;
      if (h < 20 || w < 20) return false;
      return true;
    });
}

function nodeToSection(node: DSLNode, nodeMap: Map<string, DSLNode>): Section {
  const descendantIds = collectDescendantIds(node, nodeMap);
  const derivedName = deriveSectionName(node, nodeMap);
  return {
    id: nextSectionId(),
    name: derivedName || node.name || "Section",
    nodeId: node.id,
    nodeIds: [node.id, ...descendantIds],
    complexity: computeComplexity(node, nodeMap),
  };
}

/** 从 section 内的文本节点推导语义化名称 */
function deriveSectionName(node: DSLNode, nodeMap: Map<string, DSLNode>): string {
  const texts: string[] = [];
  function collectTexts(nid: string) {
    const n = nodeMap.get(nid);
    if (!n) return;
    if (n.content?.text) {
      texts.push(n.content.text.trim());
    }
    for (const cid of n.children) collectTexts(cid);
  }
  collectTexts(node.id);

  for (const text of texts) {
    const t = text.trim().replace(/\n/g, " ");
    if (t.length >= 3 && t.length <= 80 && !/^\d+[).]?\s*/.test(t)) {
      return t.replace(/[^a-zA-Z0-9一-龥\s-]/g, "").trim();
    }
  }
  return "";
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
