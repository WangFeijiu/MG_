/**
 * 机器 DSL 到预览 HTML 的生成器（v2 优化版）
 *
 * 优化点：
 * - Design Token → CSS 变量（:root 定义）
 * - CSS 类去重（相同样式共享类名）
 * - Section 分块（data-section-id）
 * - 保持 data-dsl-id 等插件编辑属性
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { extractDesignTokens, generateCSSTokenBlock, type DesignTokens } from "./token-extractor.js";
import { buildCSSClasses, generateCSSClassBlock, type CSSClassMap } from "./css-optimizer.js";
import { splitSections, type Section } from "./section-splitter.js";

export function generatePreviewHTML(dsl: MachineDSL): string {
  const { page, nodes } = dsl;

  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) throw new Error("Root node not found");

  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  // Step 1: 提取 Design Tokens
  const tokens = extractDesignTokens(dsl);

  // Step 2: 构建 CSS 类
  const classMap = buildCSSClasses(nodes, nodeMap, tokens);

  // Step 3: 识别 Sections
  const sections = splitSections(dsl);
  const sectionMap = new Map<string, Section>();
  for (const sec of sections) {
    for (const nid of sec.nodeIds) {
      sectionMap.set(nid, sec);
    }
  }

  // Step 4: 生成 CSS 块
  const tokenCSS = generateCSSTokenBlock(tokens);
  const classCSS = generateCSSClassBlock(classMap);

  // Step 5: 生成 HTML body
  const bodyHTML = renderNode(rootNode, nodeMap, classMap, sectionMap);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name} - Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      justify-content: center;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .dsl-node { transition: outline 0.15s ease; }
    .dsl-node:hover { outline: 2px solid rgba(59, 130, 246, 0.5); outline-offset: 2px; }
    .dsl-node.selected { outline: 2px solid rgb(59, 130, 246); outline-offset: 2px; }

    /* Design Tokens */
    ${tokenCSS}

    /* CSS Classes */
    ${classCSS}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}

function renderNode(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  sectionMap: Map<string, Section>,
): string {
  const tag = getHTMLTag(node);
  const attrs = generateAttributes(node, classMap, sectionMap);

  let content = "";

  // 图片节点
  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style.objectFit || "cover";
    const onerror = `var p=this.parentElement;p.style.background='linear-gradient(135deg,#e8e8e8 25%,#d0d0d0 50%,#e8e8e8 75%)';this.style.display='none'`;
    content = `<img src="${escapeAttr(node.content.src)}" alt="${escapeAttr(node.name || '')}" style="display:block; width:100%; height:100%; object-fit:${objectFit};" onerror="${onerror}" />`;
    return `<${tag}${attrs}>${content}</${tag}>`;
  }

  // 文本内容
  if (node.type === "text" && node.content?.text) {
    content = escapeHTML(node.content.text);
  }

  // 子节点
  if (node.children.length > 0) {
    const childrenHTML = node.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(child => renderNode(child!, nodeMap, classMap, sectionMap))
      .join("\n");
    content += (content ? "\n" : "") + childrenHTML;
  }

  if (!content) {
    return `<${tag}${attrs} />`;
  }

  return `<${tag}${attrs}>${content}</${tag}>`;
}

function getHTMLTag(node: DSLNode): string {
  switch (node.type) {
    case "button": return "button";
    case "text": return "p";
    default: return "div";
  }
}

/**
 * 生成节点属性 — 有 CSS 类用类，否则用内联 style
 */
function generateAttributes(
  node: DSLNode,
  classMap: CSSClassMap,
  sectionMap: Map<string, Section>,
): string {
  const classParts = ["dsl-node", `dsl-${node.type}`];

  // 添加优化后的 CSS 类
  const extraClasses = classMap.nodeClasses.get(node.id);
  if (extraClasses) {
    classParts.push(...extraClasses);
  }

  const parts = [
    `class="${classParts.join(" ")}"`,
  ];

  // 内联样式（非去重节点）
  const inlineStyle = classMap.nodeInlineStyles.get(node.id);
  if (inlineStyle) {
    parts.push(`style="${inlineStyle}"`);
  }

  parts.push(`data-dsl-id="${node.id}"`);
  parts.push(`data-dsl-type="${node.type}"`);
  if (node.name) parts.push(`data-dsl-name="${escapeAttr(node.name)}"`);

  // Section 标记 — 只在 Section 根节点添加
  const section = sectionMap.get(node.id);
  if (section && section.nodeId === node.id) {
    parts.push(`data-section-id="${section.id}"`);
    parts.push(`data-section-name="${escapeAttr(section.name)}"`);
  }

  return " " + parts.join(" ");
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
