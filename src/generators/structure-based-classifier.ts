/**
 * 基于DSL结构的Section分类器
 *
 * 不依赖文本内容，完全基于节点结构、布局、类型等特征进行分类
 */

import type { DSLNode } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";

export type SectionType =
  | "navbar" | "hero" | "heroSection" | "features" | "featureRow" | "process"
  | "gridRow" | "cta" | "showcase" | "testimonials" | "splitCta"
  | "videos" | "faq" | "contact" | "footer" | "content";

export type StructuralFeatures = {
  height: number;
  nodeCount: number;
  depth: number;
  hasImages: boolean;
  imageCount: number;
  textCount: number;
  containerCount: number;
  layoutMode: "horizontal" | "vertical" | "mixed";
  childrenArrangement: "single" | "pair" | "grid" | "list";
  hasRepeatingPattern: boolean;
  averageChildHeight: number;
  widthRatio: number; // 相对于页面宽度的比例
};

/**
 * 基于结构特征分类Section
 */
export function classifySectionByStructure(
  section: Section,
  sectionIndex: number,
  totalSections: number,
  nodeMap: Map<string, DSLNode>,
  pageWidth: number,
): SectionType {
  const root = nodeMap.get(section.nodeId);
  if (!root) return "content";

  const features = extractStructuralFeatures(root, nodeMap, pageWidth);

  // 1. Navbar: 第一个Section，高度小，水平布局
  if (sectionIndex === 0 && features.height < 120 && features.layoutMode === "horizontal") {
    return "navbar";
  }

  // 2. Footer: 最后一个Section
  if (sectionIndex === totalSections - 1) {
    return "footer";
  }

  // 3. Hero: 大高度，有背景图，文字+按钮
  if (features.height > 350 && features.hasImages && features.textCount >= 2 && features.nodeCount < 20) {
    return "hero";
  }

  // 4. HeroSection: 纯文字标题区，高度适中，节点少
  if (!features.hasImages && features.textCount <= 3 && features.nodeCount <= 8 && features.height < 300) {
    return "heroSection";
  }

  // 5. Features: 多个重复的行，每行有图片+文字
  if (features.hasRepeatingPattern && features.childrenArrangement === "list" && features.imageCount >= 4) {
    return "features";
  }

  // 6. FeatureRow: 单行图文，水平布局，成对出现
  if (features.childrenArrangement === "pair" && features.hasImages && features.layoutMode === "horizontal") {
    return "featureRow";
  }

  // 7. Process: 3-4个步骤卡片，网格布局
  if (features.childrenArrangement === "grid" && features.containerCount >= 3 && features.containerCount <= 4) {
    return "process";
  }

  // 8. GridRow: 多个卡片，网格布局
  if (features.childrenArrangement === "grid" && features.hasRepeatingPattern) {
    return "gridRow";
  }

  // 9. SplitCta: 左右分栏，一侧图片一侧文字
  if (features.childrenArrangement === "pair" && features.hasImages && features.nodeCount < 15) {
    return "splitCta";
  }

  // 10. CTA: 纯文字，居中，高度小
  if (!features.hasImages && features.textCount <= 3 && features.height < 200) {
    return "cta";
  }

  // 默认
  return "content";
}

/**
 * 提取结构特征
 */
function extractStructuralFeatures(
  root: DSLNode,
  nodeMap: Map<string, DSLNode>,
  pageWidth: number,
): StructuralFeatures {
  const allNodes = collectAllDescendants(root, nodeMap);
  const directChildren = root.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];

  const height = typeof root.layout.height === "number" ? root.layout.height : 400;
  const width = typeof root.layout.width === "number" ? root.layout.width : pageWidth;
  const widthRatio = width / pageWidth;

  const nodeCount = allNodes.length;
  const depth = calculateDepth(root, nodeMap);

  const imageCount = allNodes.filter(n => n.type === "image").length;
  const textCount = allNodes.filter(n => n.type === "text").length;
  const containerCount = allNodes.filter(n => n.type === "container").length;
  const hasImages = imageCount > 0;

  const layoutMode = detectLayoutMode(directChildren);
  const childrenArrangement = detectChildrenArrangement(directChildren, nodeMap);
  const hasRepeatingPattern = detectRepeatingPattern(directChildren, nodeMap);

  const averageChildHeight = directChildren.length > 0
    ? directChildren.reduce((sum, c) => sum + (typeof c.layout.height === "number" ? c.layout.height : 0), 0) / directChildren.length
    : 0;

  return {
    height,
    nodeCount,
    depth,
    hasImages,
    imageCount,
    textCount,
    containerCount,
    layoutMode,
    childrenArrangement,
    hasRepeatingPattern,
    averageChildHeight,
    widthRatio,
  };
}

/**
 * 检测布局模式
 */
function detectLayoutMode(children: DSLNode[]): "horizontal" | "vertical" | "mixed" {
  if (children.length < 2) return "vertical";

  const positions = children.map(c => ({
    x: c.layout.x ?? 0,
    y: c.layout.y ?? 0,
    width: typeof c.layout.width === "number" ? c.layout.width : 0,
    height: typeof c.layout.height === "number" ? c.layout.height : 0,
  }));

  let horizontalCount = 0;
  let verticalCount = 0;

  for (let i = 0; i < positions.length - 1; i++) {
    const curr = positions[i];
    const next = positions[i + 1];

    const currRight = curr.x + curr.width;
    const currBottom = curr.y + curr.height;

    // 水平排列：下一个元素在右侧
    if (next.x >= currRight - 10) {
      horizontalCount++;
    }
    // 垂直排列：下一个元素在下方
    else if (next.y >= currBottom - 10) {
      verticalCount++;
    }
  }

  if (horizontalCount > verticalCount * 2) return "horizontal";
  if (verticalCount > horizontalCount * 2) return "vertical";
  return "mixed";
}

/**
 * 检测子元素排列方式
 */
function detectChildrenArrangement(
  children: DSLNode[],
  nodeMap: Map<string, DSLNode>,
): "single" | "pair" | "grid" | "list" {
  if (children.length === 0) return "single";
  if (children.length === 1) return "single";
  if (children.length === 2) return "pair";

  // 检测网格：多行多列
  const positions = children.map(c => ({
    x: c.layout.x ?? 0,
    y: c.layout.y ?? 0,
  }));

  const uniqueX = new Set(positions.map(p => Math.round(p.x / 10) * 10));
  const uniqueY = new Set(positions.map(p => Math.round(p.y / 10) * 10));

  if (uniqueX.size >= 2 && uniqueY.size >= 2) return "grid";
  if (uniqueY.size >= 3) return "list";

  return "list";
}

/**
 * 检测重复模式
 */
function detectRepeatingPattern(children: DSLNode[], nodeMap: Map<string, DSLNode>): boolean {
  if (children.length < 3) return false;

  // 检查子元素的结构是否相似
  const structures = children.map(c => getNodeStructure(c, nodeMap));

  let similarCount = 0;
  for (let i = 0; i < structures.length - 1; i++) {
    if (areStructuresSimilar(structures[i], structures[i + 1])) {
      similarCount++;
    }
  }

  return similarCount >= structures.length - 2;
}

/**
 * 获取节点结构签名
 */
function getNodeStructure(node: DSLNode, nodeMap: Map<string, DSLNode>): string {
  const childTypes = node.children
    .map(id => nodeMap.get(id))
    .filter(Boolean)
    .map(c => c!.type)
    .sort()
    .join(",");

  return `${node.type}:${node.children.length}:[${childTypes}]`;
}

/**
 * 判断两个结构是否相似
 */
function areStructuresSimilar(struct1: string, struct2: string): boolean {
  return struct1 === struct2;
}

/**
 * 计算树深度
 */
function calculateDepth(node: DSLNode, nodeMap: Map<string, DSLNode>): number {
  if (node.children.length === 0) return 1;

  let maxChildDepth = 0;
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) {
      const childDepth = calculateDepth(child, nodeMap);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
  }

  return 1 + maxChildDepth;
}

/**
 * 收集所有后代节点
 */
function collectAllDescendants(node: DSLNode, nodeMap: Map<string, DSLNode>): DSLNode[] {
  const result: DSLNode[] = [node];

  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) {
      result.push(...collectAllDescendants(child, nodeMap));
    }
  }

  return result;
}
