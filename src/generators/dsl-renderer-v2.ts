/**
 * 新一代DSL渲染器 - 完全数据驱动，无硬编码
 *
 * 核心原则：
 * 1. 所有样式从DSL提取
 * 2. 禁止绝对布局，仅使用Flexbox/Grid
 * 3. 响应式设计
 * 4. 流畅动画效果
 * 5. 支持任意DSL结构
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import type { DSLAnalysis } from "./dsl-analyzer.js";
import { renderButton, renderImage, esc } from "../components/dynamic-components.js";
import { renderContainer, renderGrid, renderSection } from "../components/responsive-layout.js";
import { GLOBAL_ANIMATIONS_CSS, addAnimationClass, addHoverEffect } from "../components/animations.js";
import { renderSvgIcon } from "./svg-renderer.js";

export type SectionRenderResult = { html: string; css: string };

// ========== 主入口 ==========

export function renderPageProgrammatic(
  dsl: MachineDSL,
  sections: Section[],
  _originalData: OriginalDslData | null,
  analysis: DSLAnalysis,
): SectionRenderResult {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const allHTML: string[] = [];
  const cssSet = new Set<string>();

  // 添加全局动画CSS
  cssSet.add(GLOBAL_ANIMATIONS_CSS);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const result = renderSectionDynamic(section, nodeMap, i);

    allHTML.push(result.html);
    if (result.css) cssSet.add(result.css);
  }

  return { html: allHTML.join("\n\n"), css: [...cssSet].join("\n\n") };
}

// ========== 动态Section渲染 ==========

function renderSectionDynamic(
  section: Section,
  nodeMap: Map<string, DSLNode>,
  index: number,
): SectionRenderResult {
  const root = nodeMap.get(section.nodeId);
  if (!root) return { html: "", css: "" };

  const animClass = addAnimationClass(index);
  const result = renderNode(root, nodeMap, 0);

  const sectionResult = renderSection({
    node: root,
    children: result.html,
    className: animClass,
  });

  return {
    html: sectionResult.html,
    css: sectionResult.css + "\n\n" + result.css,
  };
}

// ========== 节点渲染（递归） ==========

function renderNode(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  depth: number,
): { html: string; css: string } {
  const cssSet = new Set<string>();

  // 根据节点类型渲染
  switch (node.type) {
    case "text":
      return renderTextNode(node);

    case "image":
      return renderImageNode(node);

    case "button":
      return renderButtonNode(node);

    case "icon":
      return renderIconNode(node);

    case "container":
      return renderContainerNode(node, nodeMap, depth);

    default:
      return { html: "", css: "" };
  }
}

// ========== 文本节点 ==========

function renderTextNode(node: DSLNode): { html: string; css: string } {
  const text = node.content?.text || "";
  const fontSize = node.style?.fontSize || 16;
  const fontWeight = node.style?.fontWeight || 400;
  const color = node.style?.color || "inherit";
  const lineHeight = node.style?.lineHeight || 1.5;
  const textAlign = node.style?.textAlign || "left";

  const textClass = `text-${node.id}`;

  const tag = fontSize >= 32 ? "h1" : fontSize >= 24 ? "h2" : fontSize >= 20 ? "h3" : "p";

  const html = `<${tag} class="${textClass}">${esc(text)}</${tag}>`;

  const css = `.${textClass} {
  font-size: ${fontSize}px;
  font-weight: ${fontWeight};
  color: ${color};
  line-height: ${lineHeight};
  text-align: ${textAlign};
  margin: 0;
}`;

  return { html, css };
}

// ========== 图片节点 ==========

function renderImageNode(node: DSLNode): { html: string; css: string } {
  const src = node.content?.src || "";
  const alt = node.name || "";

  return renderImage({
    src,
    alt,
    node,
    className: addHoverEffect("scale"),
  });
}

// ========== 按钮节点 ==========

function renderButtonNode(node: DSLNode): { html: string; css: string } {
  const text = node.content?.text || "Button";

  return renderButton({
    text,
    node,
    variant: "primary",
    className: addHoverEffect("lift"),
  });
}

// ========== 图标节点 ==========

function renderIconNode(node: DSLNode): { html: string; css: string } {
  const svgPaths = node.meta?.svgPaths || [];
  const width = typeof node.layout.width === "number" ? node.layout.width : 24;
  const height = typeof node.layout.height === "number" ? node.layout.height : 24;

  const svgHtml = renderSvgIcon(svgPaths, width, height);
  const iconClass = `icon-${node.id}`;

  const html = `<div class="${iconClass}">${svgHtml}</div>`;

  const css = `.${iconClass} {
  width: ${width}px;
  height: ${height}px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}`;

  return { html, css };
}

// ========== 容器节点 ==========

function renderContainerNode(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  depth: number,
): { html: string; css: string } {
  const cssSet = new Set<string>();

  // 递归渲染子节点
  const childrenResults = node.children
    .map(childId => nodeMap.get(childId))
    .filter(Boolean)
    .map(child => renderNode(child!, nodeMap, depth + 1));

  const childrenHTML = childrenResults.map(r => r.html).join("\n");
  childrenResults.forEach(r => {
    if (r.css) cssSet.add(r.css);
  });

  // 判断是否使用Grid布局（如果子节点数量>=3且布局方向为row）
  const useGrid = node.children.length >= 3 && node.layout?.direction === "row";

  let result: { html: string; css: string };

  if (useGrid) {
    result = renderGrid({
      node,
      children: childrenResults.map(r => r.html),
      columns: Math.min(node.children.length, 4),
    });
  } else {
    result = renderContainer({
      node,
      children: childrenHTML,
    });
  }

  cssSet.add(result.css);

  return {
    html: result.html,
    css: [...cssSet].join("\n\n"),
  };
}
