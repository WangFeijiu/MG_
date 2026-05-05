/**
 * Section Manifest — 将 DSL 节点树转为结构化 JSON 给 LLM
 *
 * 核心设计：
 * - bounds: 绝对页面坐标（用于设计稿裁剪）
 * - relativeBounds: 相对于 section root 的坐标（用于 DOM 几何对比）
 * - visualTokens: 精简样式子集（用于 diff 检测对比）
 * - 深度裁剪: 只保留前 4 层完整数据，更深层级给摘要
 */

import type { DSLNode } from "../types/machine-dsl.js";

export type NodeManifest = {
  id: string;
  type: string;
  name?: string;
  /** 绝对页面坐标 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 相对于 section root 的坐标 */
  relativeBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** LLM 语义分析回填的角色 (如 "title", "cta-button") */
  semanticRole?: string;
  /** 精简样式子集，用于 diff 检测 */
  visualTokens: {
    background?: string;
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeight?: number;
  };
  layout: {
    mode?: string;
    direction?: string;
    justify?: string;
    align?: string;
    wrap?: string;
    gap?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
  };
  style: Record<string, unknown>;
  content?: {
    text?: string;
    src?: string;
  };
  children: NodeManifest[];
  _summary?: string;
};

export type SectionManifest = {
  sectionId: string;
  sectionName: string;
  /** LLM 语义分析回填 */
  semanticType?: string;
  purpose?: string;
  suggestedRootTag?: string;
  suggestedClassName?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rootTag: string;
  rootClassName: string;
  children: NodeManifest[];
};

const MAX_DEPTH = 4;

export function buildSectionManifest(
  sectionRoot: DSLNode,
  nodeMap: Map<string, DSLNode>,
  sectionName: string,
  pageWidth: number,
): SectionManifest {
  const rootX = sectionRoot.layout.x ?? 0;
  const rootY = sectionRoot.layout.y ?? 0;
  const rootW = typeof sectionRoot.layout.width === "number" ? sectionRoot.layout.width : pageWidth;
  const rootH = typeof sectionRoot.layout.height === "number" ? sectionRoot.layout.height : 0;

  const manifest: SectionManifest = {
    sectionId: sectionRoot.id,
    sectionName,
    bounds: { x: rootX, y: rootY, width: rootW, height: rootH },
    rootTag: sectionRoot.type,
    rootClassName: sectionRoot.name || "",
    children: buildChildManifests(sectionRoot, nodeMap, 0, rootX, rootY),
  };

  // 归一化 relativeBounds: DSL 子节点的绝对坐标可能低于父节点，
  // 导致负的 relativeBounds。归一化使最小坐标为 0。
  normalizeBounds(manifest);

  return manifest;
}

/**
 * 用 LLM 语义分析结果回填 manifest 的 semanticRole / semanticType
 */
export function enrichManifestsWithSemantics(
  manifests: SectionManifest[],
  semantics: Map<string, { semanticType?: string; purpose?: string; suggestedRootTag?: string; suggestedClassName?: string; keyElements?: Array<{ nodeId: string; role: string }> }>,
  sectionIdToManifestIdx: Map<string, number>,
): void {
  for (const [sectionId, sem] of semantics) {
    const idx = sectionIdToManifestIdx.get(sectionId);
    if (idx === undefined) continue;
    const m = manifests[idx];
    if (!m) continue;

    m.semanticType = sem.semanticType;
    m.purpose = sem.purpose;
    m.suggestedRootTag = sem.suggestedRootTag;
    m.suggestedClassName = sem.suggestedClassName;

    if (sem.keyElements) {
      const roleMap = new Map(sem.keyElements.map(e => [e.nodeId, e.role]));
      stampRoles(m.children, roleMap);
    }
  }
}

function stampRoles(nodes: NodeManifest[], roleMap: Map<string, string>): void {
  for (const node of nodes) {
    const role = roleMap.get(node.id);
    if (role) node.semanticRole = role;
    stampRoles(node.children, roleMap);
  }
}

// ========== 坐标归一化 ==========

function normalizeBounds(manifest: SectionManifest): void {
  const all = collectAllNodes(manifest.children);
  if (all.length === 0) return;

  const minX = all.reduce((m, n) => Math.min(m, n.relativeBounds.x), Infinity);
  const minY = all.reduce((m, n) => Math.min(m, n.relativeBounds.y), Infinity);

  if (minX === 0 && minY === 0) return;

  for (const n of all) {
    n.relativeBounds.x -= minX;
    n.relativeBounds.y -= minY;
  }
}

function collectAllNodes(nodes: NodeManifest[]): NodeManifest[] {
  const result: NodeManifest[] = [];
  for (const n of nodes) {
    result.push(n);
    result.push(...collectAllNodes(n.children));
  }
  return result;
}

// ========== 内部构建 ==========

function buildChildManifests(
  node: DSLNode, nodeMap: Map<string, DSLNode>, depth: number, rootX: number, rootY: number,
): NodeManifest[] {
  return node.children
    .map(id => nodeMap.get(id))
    .filter((n): n is DSLNode => !!n)
    .map(child => buildNodeManifest(child, nodeMap, depth, rootX, rootY));
}

function buildNodeManifest(
  node: DSLNode, nodeMap: Map<string, DSLNode>, depth: number, rootX: number, rootY: number,
): NodeManifest {
  const absX = node.layout.x ?? 0;
  const absY = node.layout.y ?? 0;
  const w = typeof node.layout.width === "number" ? node.layout.width : 0;
  const h = typeof node.layout.height === "number" ? node.layout.height : 0;

  const layout = buildLayoutMap(node);
  const style = buildStyleMap(node);
  const visualTokens = buildVisualTokens(node);

  const children = depth < MAX_DEPTH
    ? buildChildManifests(node, nodeMap, depth + 1, rootX, rootY)
    : [];

  const manifest: NodeManifest = {
    id: node.id,
    type: node.type,
    bounds: { x: absX, y: absY, width: w, height: h },
    relativeBounds: { x: absX - rootX, y: absY - rootY, width: w, height: h },
    visualTokens,
    layout,
    style,
    children,
  };

  if (node.name) manifest.name = node.name;

  if (node.content?.text) {
    manifest.content = { text: node.content.text };
  } else if (node.content?.src) {
    manifest.content = { src: node.content.src };
  }

  if (depth >= MAX_DEPTH && node.children.length > 0) {
    const childDescs = node.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(c => {
          const n = c!;
          const parts: string[] = [n.type];
          if (n.name) parts.push(`"${n.name}"`);
          if (n.content?.text) parts.push(`text:"${n.content.text.slice(0, 30)}"`);
          if (n.content?.src) parts.push("img");
          if (n.children.length > 0) parts.push(`(${n.children.length} children)`);
          return parts.join(" ");
        });
    manifest._summary = `${node.children.length} children: ${childDescs.join(", ")}`;
  }

  return manifest;
}

function buildVisualTokens(node: DSLNode): NodeManifest["visualTokens"] {
  const vt: NodeManifest["visualTokens"] = {};
  if (node.style.background) vt.background = node.style.background;
  if (node.style.color) vt.color = node.style.color;
  if (node.style.fontSize) vt.fontSize = node.style.fontSize;
  if (node.style.fontWeight) vt.fontWeight = node.style.fontWeight;
  if (node.style.lineHeight) vt.lineHeight = node.style.lineHeight;
  return vt;
}

function buildLayoutMap(node: DSLNode): NodeManifest["layout"] {
  const layout: NodeManifest["layout"] = {};
  if (node.layout.mode) layout.mode = node.layout.mode;
  if (node.layout.direction) layout.direction = node.layout.direction === "row" ? "horizontal" : "vertical";
  if (node.layout.justify) layout.justify = node.layout.justify;
  if (node.layout.align) layout.align = node.layout.align;
  if (node.layout.wrap) layout.wrap = node.layout.wrap;
  if (node.layout.gap !== undefined) layout.gap = node.layout.gap;
  if (node.style.padding) {
    layout.padding = {
      top: node.style.padding.top,
      right: node.style.padding.right,
      bottom: node.style.padding.bottom,
      left: node.style.padding.left,
    };
  }
  return layout;
}

function buildStyleMap(node: DSLNode): Record<string, unknown> {
  const s = node.style;
  const style: Record<string, unknown> = {};
  if (s.background) style.background = s.background;
  if (s.backgroundImage) style.backgroundImage = s.backgroundImage;
  if (s.color) style.color = s.color;
  if (s.fontSize) style.fontSize = s.fontSize;
  if (s.fontWeight) style.fontWeight = s.fontWeight;
  if (s.lineHeight) style.lineHeight = s.lineHeight;
  if (s.letterSpacing) style.letterSpacing = s.letterSpacing;
  if (s.fontFamily) style.fontFamily = s.fontFamily;
  if (s.textAlign) style.textAlign = s.textAlign;
  if (s.textTransform) style.textTransform = s.textTransform;
  if (s.opacity !== undefined) style.opacity = s.opacity;
  if (s.borderRadius) {
    const r = s.borderRadius;
    style.borderRadius = r.topLeft === r.topRight && r.topLeft === r.bottomRight && r.topLeft === r.bottomLeft
      ? r.topLeft
      : `${r.topLeft}px ${r.topRight}px ${r.bottomRight}px ${r.bottomLeft}px`;
  }
  if (s.boxShadow) style.boxShadow = s.boxShadow;
  if (s.border) style.border = s.border;
  if (s.overflow) style.overflow = s.overflow;
  if (s.objectFit) style.objectFit = s.objectFit;
  if (s.cursor) style.cursor = s.cursor;
  if (s.transform) style.transform = s.transform;
  if (s.transition) style.transition = s.transition;
  return style;
}
