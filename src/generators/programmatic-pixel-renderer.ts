/**
 * 程序化像素渲染器 — 从 Manifest 精确还原布局
 *
 * 策略：
 * - 外层容器用相对定位 + 固定高度
 * - 所有节点（包括深层）扁平化放在容器内，用绝对定位
 * - 坐标直接用 relativeBounds（相对于 section root），不需要递归偏移
 * - 所有视觉值从 Manifest 直接取，LLM 不参与
 */

import type { DSLNode } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";
import type { SectionManifest, NodeManifest } from "./section-manifest.js";
import type { SectionSemantics } from "./llm-semantic-analyzer.js";

export function renderPixelHTML(
  section: Section,
  manifest: SectionManifest,
  semantics: SectionSemantics | null,
): string {
  const className = semantics?.suggestedClassName || "section-block";
  const rootTag = semantics?.suggestedRootTag || "section";

  // 扁平化收集所有节点
  const allNodes = flattenNodes(manifest.children);

  // 计算实际内容高度（归一化后坐标已从 0 开始）
  const contentHeight = allNodes.reduce(
    (m, n) => Math.max(m, n.relativeBounds.y + n.relativeBounds.height), 0
  );

  const rootStyle = [
    "position:relative",
    `width:${manifest.bounds.width}px`,
    `height:${contentHeight}px`,
    "overflow:hidden",
  ].join(";");

  const childrenHTML = allNodes
    .map(node => renderFlatNode(node, node.relativeBounds.x, node.relativeBounds.y))
    .join("\n");

  return `<${rootTag} class="${className}" data-dsl-id="${manifest.sectionId}" style="${rootStyle}">
${childrenHTML}
</${rootTag}>`;
}

/** 递归展开所有节点（深度优先），保留层级语义用于 tag 选择 */
function flattenNodes(nodes: NodeManifest[]): NodeManifest[] {
  const result: NodeManifest[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenNodes(node.children));
    }
  }
  return result;
}

function renderFlatNode(node: NodeManifest, adjustedX: number, adjustedY: number): string {
  const style = buildFlatNodeStyle(node, adjustedX, adjustedY);
  const tag = pickTag(node);
  const content = buildContent(node);

  if (content) {
    return `<${tag} data-dsl-id="${node.id}" style="${style}">${content}</${tag}>`;
  }

  // HTML 不支持 <div /> 自闭合 — 必须用 <div></div>
  return `<${tag} data-dsl-id="${node.id}" style="${style}"></${tag}>`;
}

function pickTag(node: NodeManifest): string {
  if (node.semanticRole === "title" || node.semanticRole === "headline") return "h2";
  if (node.semanticRole === "subtitle") return "h3";
  if (node.semanticRole === "description" || node.semanticRole === "body") return "p";
  if (node.semanticRole === "cta-button" || node.type === "button") return "a";
  if (node.type === "image") return "div";
  if (node.type === "text") return "span";
  return "div";
}

function buildContent(node: NodeManifest): string {
  if (node.content?.text) return escapeHTML(node.content.text);
  if (node.content?.src) {
    const objectFit = (node.style.objectFit as string) || "cover";
    return `<img src="${escapeAttr(node.content.src)}" alt="" style="display:block;width:100%;height:100%;object-fit:${objectFit};" />`;
  }
  return "";
}

function buildFlatNodeStyle(node: NodeManifest, adjustedX: number, adjustedY: number): string {
  const parts: string[] = [];

  parts.push("position:absolute");
  parts.push(`left:${adjustedX}px`);
  parts.push(`top:${adjustedY}px`);
  parts.push(`width:${node.relativeBounds.width}px`);
  if (node.relativeBounds.height > 0) parts.push(`height:${node.relativeBounds.height}px`);

  const vt = node.visualTokens;
  if (vt.background) parts.push(`background:${vt.background}`);
  if (vt.color) parts.push(`color:${vt.color}`);
  if (vt.fontSize) parts.push(`font-size:${vt.fontSize}px`);
  if (vt.fontWeight) parts.push(`font-weight:${vt.fontWeight}`);
  if (vt.lineHeight) parts.push(`line-height:${vt.lineHeight}px`);

  const s = node.style;
  if (s.borderRadius !== undefined) parts.push(`border-radius:${s.borderRadius}px`);
  if (s.boxShadow) parts.push(`box-shadow:${s.boxShadow}`);
  if (s.border) parts.push(`border:${s.border}`);
  if (s.opacity !== undefined) parts.push(`opacity:${s.opacity}`);
  if (s.textAlign) parts.push(`text-align:${s.textAlign}`);
  if (s.letterSpacing) parts.push(`letter-spacing:${s.letterSpacing}px`);

  // padding — 只对文本和按钮节点
  if (node.layout.padding && (node.type === "text" || node.type === "button" || node.content?.text)) {
    const p = node.layout.padding;
    parts.push(`padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
  }

  // overflow hidden for images
  if (node.type === "image" || node.content?.src) {
    parts.push("overflow:hidden");
  }

  return parts.join(";");
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
