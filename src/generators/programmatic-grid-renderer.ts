/**
 * 程序化 Grid 渲染器 — 重复卡片用 CSS Grid + flex 卡片
 *
 * 策略：
 * - 检测子节点的列分布（bin x 坐标 → column count）
 * - 外层 CSS Grid（响应式：3列 → 2列 → 1列）
 * - 每个卡片用 flex column（子元素自然流动，不用 absolute）
 * - 视觉值从 manifest 取，语义标签从 semanticRole 取
 */

import type { Section } from "./section-splitter.js";
import type { SectionManifest, NodeManifest } from "./section-manifest.js";
import type { SectionSemantics } from "./llm-semantic-analyzer.js";

type GridAnalysis = {
  columnCount: number;
  gapX: number;
  gapY: number;
  rowHeight: number;
};

export function renderGridHTML(
  section: Section,
  manifest: SectionManifest,
  semantics: SectionSemantics | null,
): string {
  const className = semantics?.suggestedClassName || "grid-section";
  const rootTag = semantics?.suggestedRootTag || "section";
  const gridClass = `${className}-grid`;

  // 检测列分布
  const analysis = detectGridColumns(manifest.children);

  // 生成 CSS
  const css = buildGridCSS(gridClass, analysis, manifest);

  // 渲染卡片
  const cardsHTML = manifest.children
    .map((child, i) => renderGridCard(child, i))
    .join("\n");

  const rootStyle = [
    "position:relative",
    `width:${manifest.bounds.width}px`,
  ].join(";");

  return `<${rootTag} class="${className}" data-dsl-id="${manifest.sectionId}" style="${rootStyle}">
<style>${css}</style>
<div class="${gridClass}">
${cardsHTML}
</div>
</${rootTag}>`;
}

// ========== 列检测 ==========

function detectGridColumns(children: NodeManifest[]): GridAnalysis {
  if (children.length === 0) {
    return { columnCount: 1, gapX: 0, gapY: 0, rowHeight: 0 };
  }

  // Bin x 坐标（10px 容差）
  const xBins = new Map<number, NodeManifest[]>();
  for (const child of children) {
    const bin = Math.round(child.relativeBounds.x / 10) * 10;
    if (!xBins.has(bin)) xBins.set(bin, []);
    xBins.get(bin)!.push(child);
  }

  const columnCount = Math.max(1, xBins.size);
  const sortedBins = [...xBins.keys()].sort((a, b) => a - b);

  // 计算 gapX：相邻列的间距
  let gapX = 0;
  if (sortedBins.length >= 2) {
    const gaps: number[] = [];
    const cols = sortedBins.map(bin => xBins.get(bin)!);
    for (let i = 0; i < cols.length - 1; i++) {
      const rightEdge = Math.max(...cols[i].map(c => c.relativeBounds.x + c.relativeBounds.width));
      const leftEdge = Math.min(...cols[i + 1].map(c => c.relativeBounds.x));
      const gap = leftEdge - rightEdge;
      if (gap > 0) gaps.push(gap);
    }
    gapX = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  }

  // 计算 gapY：按行分组（同一 x bin 里的元素按 y 排序）
  const yPositions = children.map(c => Math.round(c.relativeBounds.y / 10) * 10);
  const uniqueYs = [...new Set(yPositions)].sort((a, b) => a - b);
  let gapY = 0;
  if (uniqueYs.length >= 2) {
    const yGaps: number[] = [];
    for (let i = 0; i < uniqueYs.length - 1; i++) {
      const rowChildren = children.filter(c =>
        Math.round(c.relativeBounds.y / 10) * 10 === uniqueYs[i]
      );
      const maxBottom = Math.max(...rowChildren.map(c => c.relativeBounds.y + c.relativeBounds.height));
      const gap = uniqueYs[i + 1] - maxBottom;
      if (gap > 0) yGaps.push(gap);
    }
    gapY = yGaps.length > 0 ? Math.round(yGaps.reduce((a, b) => a + b, 0) / yGaps.length) : 0;
  }

  // 平均行高
  const rowHeight = Math.round(
    children.reduce((s, c) => s + c.relativeBounds.height, 0) / children.length
  );

  return { columnCount, gapX, gapY, rowHeight };
}

// ========== CSS 生成 ==========

function buildGridCSS(
  gridClass: string,
  analysis: GridAnalysis,
  manifest: SectionManifest,
): string {
  const n = analysis.columnCount;
  const cols2 = Math.max(1, Math.floor(n / 2));

  let css = `.${gridClass}{display:grid;grid-template-columns:repeat(${n},1fr);`;
  css += `gap:${analysis.gapY}px ${analysis.gapX}px;`;
  css += `padding:0;`;

  // 从第一个子节点取背景色
  const vt = manifest.children[0]?.visualTokens || {};
  if (vt.background) css += `background:${vt.background};`;

  css += `}\n`;

  // 卡片样式
  css += `.${gridClass}>article{display:flex;flex-direction:column;overflow:hidden;`;

  // 从子节点取 padding（如果有）
  const firstChild = manifest.children[0];
  if (firstChild?.layout.padding) {
    const p = firstChild.layout.padding;
    css += `padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`;
  }
  if (firstChild?.style.borderRadius !== undefined) {
    css += `border-radius:${firstChild.style.borderRadius}px;`;
  }
  if (firstChild?.visualTokens.background) {
    css += `background:${firstChild.visualTokens.background};`;
  }
  if (firstChild?.style.boxShadow) {
    css += `box-shadow:${firstChild.style.boxShadow};`;
  }
  css += `}\n`;

  // 响应式断点
  if (n > 1) {
    css += `@media(max-width:1024px){.${gridClass}{grid-template-columns:repeat(${cols2},1fr);}}\n`;
    css += `@media(max-width:768px){.${gridClass}{grid-template-columns:1fr;}}\n`;
  }

  return css;
}

// ========== 卡片渲染 ==========

function renderGridCard(child: NodeManifest, index: number): string {
  const tag = child.semanticRole === "list-item" ? "li" : "article";
  const idAttr = `data-dsl-id="${child.id}"`;

  if (child.children.length > 0) {
    const innerHTML = child.children
      .map(gc => renderGridChild(gc))
      .join("\n");
    return `<${tag} ${idAttr}>\n${innerHTML}\n</${tag}>`;
  }

  // 叶节点卡片（直接有内容）
  const content = buildContent(child);
  if (content) {
    return `<${tag} ${idAttr}>${content}</${tag}>`;
  }

  return `<${tag} ${idAttr}></${tag}>`;
}

function renderGridChild(node: NodeManifest): string {
  const tag = pickTag(node);
  const style = buildChildStyle(node);
  const content = buildContent(node);

  if (node.children.length > 0) {
    const innerHTML = node.children
      .map(gc => renderGridChild(gc))
      .join("\n");
    const inner = content ? `${content}\n${innerHTML}` : innerHTML;
    return `<${tag} data-dsl-id="${node.id}" style="${style}">\n${inner}\n</${tag}>`;
  }

  if (content) {
    return `<${tag} data-dsl-id="${node.id}" style="${style}">${content}</${tag}>`;
  }

  return `<${tag} data-dsl-id="${node.id}" style="${style}"></${tag}>`;
}

function pickTag(node: NodeManifest): string {
  if (node.semanticRole === "title" || node.semanticRole === "headline") return "h3";
  if (node.semanticRole === "subtitle") return "h4";
  if (node.semanticRole === "description" || node.semanticRole === "body") return "p";
  if (node.semanticRole === "cta-button" || node.type === "button") return "a";
  if (node.type === "image") return "figure";
  if (node.type === "text") return "span";
  return "div";
}

function buildContent(node: NodeManifest): string {
  if (node.content?.text) return escapeHTML(node.content.text);
  if (node.content?.src) {
    const objectFit = (node.style.objectFit as string) || "cover";
    const imgStyle = `display:block;width:100%;height:100%;object-fit:${objectFit};`;
    return `<img src="${escapeAttr(node.content.src)}" alt="" style="${imgStyle}" />`;
  }
  return "";
}

function buildChildStyle(node: NodeManifest): string {
  const parts: string[] = [];

  const vt = node.visualTokens;
  if (vt.color) parts.push(`color:${vt.color}`);
  if (vt.fontSize) parts.push(`font-size:${vt.fontSize}px`);
  if (vt.fontWeight) parts.push(`font-weight:${vt.fontWeight}`);
  if (vt.lineHeight) parts.push(`line-height:${vt.lineHeight}px`);
  if (vt.background) parts.push(`background:${vt.background}`);

  const s = node.style;
  if (s.borderRadius !== undefined) parts.push(`border-radius:${s.borderRadius}px`);
  if (s.textAlign) parts.push(`text-align:${s.textAlign}`);
  if (s.opacity !== undefined) parts.push(`opacity:${s.opacity}`);
  if (s.letterSpacing) parts.push(`letter-spacing:${s.letterSpacing}px`);

  // 图片容器
  if (node.type === "image" || node.content?.src) {
    parts.push("overflow:hidden");
    const ratio = node.relativeBounds.width > 0 && node.relativeBounds.height > 0
      ? node.relativeBounds.width / node.relativeBounds.height
      : 0;
    if (ratio > 0) parts.push(`aspect-ratio:${ratio.toFixed(3)}`);
  }

  return parts.join(";");
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
