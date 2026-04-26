/**
 * Programmatic DSL Analyzer
 *
 * Pure computation — no LLM calls. Produces structured analysis of the page
 * that feeds into the whole-page LLM prompt.
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { DesignTokens } from "./token-extractor.js";
import type { GlobalDesignSystem } from "./global-design-system.js";
import { extractDesignTokens } from "./token-extractor.js";
import { generateGlobalDesignSystem } from "./global-design-system.js";
import { splitSections, type Section } from "./section-splitter.js";
import { buildCompactTree } from "./tree-formatter.js";

export type DSLAnalysis = {
  page: { name: string; width: number; height: number };
  sections: AnalyzedSection[];
  typographyScale: Array<{ size: number; usage: number; role: string }>;
  colorPalette: Array<{ value: string; role: string; frequency: number }>;
  contentWidth: number;
  designSystem: GlobalDesignSystem;
  tokens: DesignTokens;
};

export type AnalyzedSection = {
  id: string;
  name: string;
  semanticGuess: SemanticGuess;
  yPosition: number;
  height: number;
  nodeCount: number;
  maxDepth: number;
  hasImages: boolean;
  hasButtons: boolean;
  childDirection: "row" | "column" | "mixed";
  textSummary: string[];
  compactTree: string;
};

export type SemanticGuess =
  | "navbar"
  | "hero"
  | "features"
  | "cards"
  | "cta"
  | "testimonials"
  | "footer"
  | "content";

export function analyzeDSL(dsl: MachineDSL): DSLAnalysis {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const tokens = extractDesignTokens(dsl);
  const designSystem = generateGlobalDesignSystem(dsl);
  const sections = splitSections(dsl);

  // Typography scale
  const typographyScale = analyzeTypography(dsl.nodes);

  // Color palette
  const colorPalette = analyzeColors(dsl.nodes);

  // Analyzed sections
  const analyzedSections = sections.map((sec, idx) =>
    analyzeSection(sec, idx, sections.length, nodeMap),
  );

  return {
    page: {
      name: dsl.page.name,
      width: dsl.page.width || 1440,
      height: dsl.page.height || 0,
    },
    sections: analyzedSections,
    typographyScale,
    colorPalette,
    contentWidth: designSystem.contentWidth,
    designSystem,
    tokens,
  };
}

function analyzeSection(
  section: Section,
  index: number,
  total: number,
  nodeMap: Map<string, DSLNode>,
): AnalyzedSection {
  const root = nodeMap.get(section.nodeId);
  if (!root) {
    return {
      id: section.id,
      name: section.name,
      semanticGuess: "content",
      yPosition: 0,
      height: 0,
      nodeCount: section.nodeIds.length,
      maxDepth: 0,
      hasImages: false,
      hasButtons: false,
      childDirection: "column",
      textSummary: [],
      compactTree: "",
    };
  }

  const yPosition = root.layout.y ?? 0;
  const height = typeof root.layout.height === "number" ? root.layout.height : 0;
  const maxDepth = computeMaxDepth(root, nodeMap);
  const { hasImages, hasButtons, texts, directions } = scanSectionContent(root, nodeMap);
  const compactTree = buildCompactTree(root, nodeMap, 0);

  const semanticGuess = guessSemantic(
    index, total, yPosition, height, texts, hasImages, hasButtons,
    root, nodeMap,
  );

  const childDirection =
    directions.size === 0 ? "column" :
    directions.size === 1 ? [...directions][0] as "row" | "column" : "mixed";

  return {
    id: section.id,
    name: section.name,
    semanticGuess,
    yPosition,
    height,
    nodeCount: section.nodeIds.length,
    maxDepth,
    hasImages,
    hasButtons,
    childDirection,
    textSummary: texts.slice(0, 8),
    compactTree,
  };
}

function guessSemantic(
  index: number,
  total: number,
  y: number,
  height: number,
  texts: string[],
  hasImages: boolean,
  hasButtons: boolean,
  root: DSLNode,
  nodeMap: Map<string, DSLNode>,
): SemanticGuess {
  // Navbar: first section, near top, short
  if (index === 0 && y < 100 && height < 120) return "navbar";

  // Footer: last section
  if (index === total - 1) return "footer";

  // Hero: contains large text (>= 40px)
  const hasLargeText = hasDescendantWith(root, nodeMap, n => {
    const fs = n.style.fontSize;
    return typeof fs === "number" && fs >= 40;
  });
  if (hasLargeText && hasImages && index <= 1) return "hero";
  if (hasLargeText && index <= 2) return "hero";

  // CTA: has buttons with action words
  const actionWords = ["get", "start", "try", "contact", "buy", "order", "book", "subscribe", "join"];
  const lowerTexts = texts.map(t => t.toLowerCase());
  const hasActionButtons = hasButtons && lowerTexts.some(t =>
    actionWords.some(w => t.includes(w)),
  );
  if (hasActionButtons && !hasLargeText) return "cta";

  // Cards / Features: repeating child structures
  const children = getValidChildren(root, nodeMap);
  if (children.length >= 3) {
    const typeSigs = children.map(c => `${c.type}:${c.children.length}`);
    const firstSig = typeSigs[0];
    const similarRatio = typeSigs.filter(s => s === firstSig).length / typeSigs.length;
    if (similarRatio >= 0.7) {
      // Check if cards have images
      return hasImages ? "features" : "cards";
    }
  }

  return "content";
}

function computeMaxDepth(node: DSLNode, nodeMap: Map<string, DSLNode>): number {
  let max = 0;
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) {
      max = Math.max(max, 1 + computeMaxDepth(child, nodeMap));
    }
  }
  return max;
}

function scanSectionContent(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
): { hasImages: boolean; hasButtons: boolean; texts: string[]; directions: Set<string> } {
  let hasImages = false;
  let hasButtons = false;
  const texts: string[] = [];
  const directions = new Set<string>();

  function walk(n: DSLNode) {
    if (n.type === "image") hasImages = true;
    if (n.type === "button") hasButtons = true;
    if (n.content?.text) {
      const t = n.content.text.trim();
      if (t.length >= 2 && t.length <= 120) texts.push(t);
    }
    if (n.layout.direction) directions.add(n.layout.direction);
    for (const cid of n.children) {
      const child = nodeMap.get(cid);
      if (child) walk(child);
    }
  }

  walk(node);
  return { hasImages, hasButtons, texts, directions };
}

function hasDescendantWith(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  predicate: (n: DSLNode) => boolean,
): boolean {
  if (predicate(node)) return true;
  for (const cid of node.children) {
    const child = nodeMap.get(cid);
    if (child && hasDescendantWith(child, nodeMap, predicate)) return true;
  }
  return false;
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

function analyzeTypography(nodes: DSLNode[]): Array<{ size: number; usage: number; role: string }> {
  const sizeFreq = new Map<number, number>();
  const sizeMaxFontSize = new Map<number, number>();

  for (const node of nodes) {
    const fs = node.style.fontSize;
    if (typeof fs === "number" && fs >= 8) {
      sizeFreq.set(fs, (sizeFreq.get(fs) ?? 0) + 1);
    }
  }

  const sorted = [...sizeFreq.entries()].sort((a, b) => b[0] - a[0]);

  return sorted.map(([size, usage]) => {
    let role = "body";
    if (size >= 72) role = "display";
    else if (size >= 40) role = "h1";
    else if (size >= 28) role = "h2";
    else if (size >= 20) role = "h3";
    else if (size >= 16) role = "body";
    else role = "small";
    return { size, usage, role };
  });
}

function analyzeColors(nodes: DSLNode[]): Array<{ value: string; role: string; frequency: number }> {
  const textColors = new Map<string, number>();
  const bgColors = new Map<string, number>();

  for (const node of nodes) {
    if (node.style.color) {
      textColors.set(node.style.color, (textColors.get(node.style.color) ?? 0) + 1);
    }
    if (node.style.background && !node.style.background.startsWith("url")) {
      bgColors.set(node.style.background, (bgColors.get(node.style.background) ?? 0) + 1);
    }
  }

  const results: Array<{ value: string; role: string; frequency: number }> = [];

  for (const [value, freq] of [...textColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    results.push({ value, role: "text", frequency: freq });
  }
  for (const [value, freq] of [...bgColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    results.push({ value, role: "background", frequency: freq });
  }

  return results;
}
