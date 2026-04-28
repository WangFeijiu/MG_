/**
 * 程序化 Section 渲染器
 *
 * 核心渲染逻辑：直接从 DSL 数据生成像素级精确的 HTML/CSS
 * 不依赖 LLM，保留所有原始设计数据（SVG、阴影、多色文本等）
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import { renderSvgIcon } from "./svg-renderer.js";

export type SectionRenderResult = {
  html: string;
  css: string;
};

/**
 * 程序化渲染一个 section
 */
export function renderSectionProgrammatic(
  section: Section,
  dsl: MachineDSL,
  nodeMap: Map<string, DSLNode>,
  originalData: OriginalDslData | null,
): SectionRenderResult {
  const root = nodeMap.get(section.nodeId);
  if (!root) {
    return { html: `<!-- Section: ${section.name} (empty) -->`, css: "" };
  }

  const cssBuilder = new CSSBuilder(`sec-${section.id.replace("section-", "s")}`);
  const html = renderNode(root, nodeMap, originalData, cssBuilder, 0);

  return {
    html: `<!-- Section: ${section.name} -->\n${html}`,
    css: cssBuilder.build(),
  };
}

/**
 * 渲染完整页面（所有 sections）
 */
export function renderPageProgrammatic(
  dsl: MachineDSL,
  sections: Section[],
  originalData: OriginalDslData | null,
): SectionRenderResult {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const allCSS: string[] = [];
  const allHTML: string[] = [];

  for (const section of sections) {
    const result = renderSectionProgrammatic(section, dsl, nodeMap, originalData);
    allHTML.push(result.html);
    if (result.css) allCSS.push(result.css);
  }

  return { html: allHTML.join("\n\n"), css: allCSS.join("\n\n") };
}

// ========== 节点渲染 ==========

function renderNode(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  originalData: OriginalDslData | null,
  cssBuilder: CSSBuilder,
  depth: number,
): string {
  // icon 节点 — 渲染内联 SVG
  if (node.type === "icon" && node.meta?.svgPaths && node.meta.svgPaths.length > 0) {
    return renderIconNode(node, cssBuilder);
  }

  // image 节点
  if (node.type === "image" && node.content?.src) {
    return renderImageNode(node, cssBuilder);
  }

  // text 节点
  if (node.type === "text" && node.content?.text) {
    return renderTextNode(node, originalData, cssBuilder);
  }

  // button 节点
  if (node.type === "button") {
    return renderContainerNode(node, "button", nodeMap, originalData, cssBuilder, depth);
  }

  // container 节点
  return renderContainerNode(node, "div", nodeMap, originalData, cssBuilder, depth);
}

function renderIconNode(node: DSLNode, cssBuilder: CSSBuilder): string {
  const className = cssBuilder.addClass(node);
  const w = typeof node.layout.width === "number" ? node.layout.width : 24;
  const h = typeof node.layout.height === "number" ? node.layout.height : 24;
  const svg = renderSvgIcon(node.meta!.svgPaths!, w, h);

  return `<div class="${className}" data-dsl-id="${node.id}">${svg}</div>`;
}

function renderImageNode(node: DSLNode, cssBuilder: CSSBuilder): string {
  const className = cssBuilder.addClass(node);
  const objectFit = node.style.objectFit || "cover";
  const src = node.content!.src!;
  const onerror = `var p=this.parentElement;p.style.background='linear-gradient(135deg,#e8e8e8 25%,#d0d0d0 50%,#e8e8e8 75%)';this.style.display='none'`;

  return `<div class="${className}" data-dsl-id="${node.id}"><img src="${escapeAttr(src)}" alt="${escapeAttr(node.name || "")}" style="display:block;width:100%;height:100%;object-fit:${objectFit}" onerror="${onerror}" /></div>`;
}

function renderTextNode(
  node: DSLNode,
  originalData: OriginalDslData | null,
  cssBuilder: CSSBuilder,
): string {
  const className = cssBuilder.addClass(node);
  let textContent: string;

  // 多色文本范围
  if (node.meta?.textColorRanges && node.meta.textColorRanges.length > 1) {
    textContent = renderMultiColorText(node.content!.text!, node.meta.textColorRanges);
  } else {
    textContent = escapeHTML(node.content!.text!);
  }

  // textMode 处理
  if (node.meta?.textMode === "single-line") {
    cssBuilder.addExtraRule(className, "white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
  }

  return `<p class="${className}" data-dsl-id="${node.id}">${textContent}</p>`;
}

function renderMultiColorText(
  text: string,
  ranges: Array<{ start: number; end: number; color: string }>,
): string {
  const parts: string[] = [];
  let lastEnd = 0;

  for (const range of ranges) {
    // 在 range 之前的文本
    if (range.start > lastEnd) {
      parts.push(escapeHTML(text.slice(lastEnd, range.start)));
    }

    const segment = text.slice(range.start, range.end);
    parts.push(`<span style="color:${escapeAttr(range.color)}">${escapeHTML(segment)}</span>`);
    lastEnd = range.end;
  }

  // 剩余文本
  if (lastEnd < text.length) {
    parts.push(escapeHTML(text.slice(lastEnd)));
  }

  return parts.join("");
}

function renderContainerNode(
  node: DSLNode,
  tag: string,
  nodeMap: Map<string, DSLNode>,
  originalData: OriginalDslData | null,
  cssBuilder: CSSBuilder,
  depth: number,
): string {
  const className = cssBuilder.addClass(node);

  // 递归渲染子节点
  const childrenHTML = node.children
    .map(id => nodeMap.get(id))
    .filter(Boolean)
    .map(child => renderNode(child!, nodeMap, originalData, cssBuilder, depth + 1))
    .join("\n");

  if (!childrenHTML && !node.content?.text) {
    return `<${tag} class="${className}" data-dsl-id="${node.id}" />`;
  }

  const inner = node.content?.text
    ? escapeHTML(node.content.text) + (childrenHTML ? "\n" + childrenHTML : "")
    : childrenHTML;

  return `<${tag} class="${className}" data-dsl-id="${node.id}">\n${inner}\n</${tag}>`;
}

// ========== CSS Builder ==========

class CSSBuilder {
  private prefix: string;
  private counter = 0;
  private rules = new Map<string, string[]>();
  private extraRules = new Map<string, string[]>();

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  addClass(node: DSLNode): string {
    const idx = this.counter++;
    const className = `${this.prefix}-${idx}`;
    const decls = this.generateDecls(node);
    this.rules.set(className, decls);
    return className;
  }

  addExtraRule(className: string, css: string): void {
    const existing = this.extraRules.get(className) || [];
    existing.push(css);
    this.extraRules.set(className, existing);
  }

  build(): string {
    const blocks: string[] = [];
    for (const [className, decls] of this.rules) {
      const extra = this.extraRules.get(className) || [];
      const allDecls = [...decls, ...extra];
      blocks.push(`.${className} {\n  ${allDecls.join(";\n  ")};\n}`);
    }
    return blocks.join("\n\n");
  }

  private generateDecls(node: DSLNode): string[] {
    const s: string[] = [];
    const isFlex = node.layout.mode === "flex";
    const isIcon = node.type === "icon";

    // ========== 布局 ==========
    if (isFlex) {
      s.push("display:flex");
      if (node.layout.direction) s.push(`flex-direction:${node.layout.direction}`);
      if (node.layout.justify) s.push(`justify-content:${node.layout.justify}`);
      if (node.layout.align) s.push(`align-items:${node.layout.align}`);
      if (node.layout.wrap) s.push(`flex-wrap:${node.layout.wrap}`);
      if (node.layout.gap !== undefined) s.push(`gap:${node.layout.gap}px`);
    } else if (node.type !== "text") {
      s.push("position:relative");
      if (node.layout.x !== undefined) s.push(`left:${node.layout.x}px`);
      if (node.layout.y !== undefined) s.push(`top:${node.layout.y}px`);
    }

    // ========== 尺寸 ==========
    const w = node.layout.width;
    const h = node.layout.height;
    if (w !== undefined && w !== "auto") s.push(`width:${typeof w === "number" ? w + "px" : w}`);
    if (h !== undefined && h !== "auto") s.push(`height:${typeof h === "number" ? h + "px" : h}`);
    if (node.layout.flexShrink !== undefined) s.push(`flex-shrink:${node.layout.flexShrink}`);

    // ========== 背景 ==========
    if (node.style.backgroundImage) {
      s.push(`background-image:url(${node.style.backgroundImage})`);
      s.push("background-size:cover");
      s.push("background-position:center");
      s.push("background-repeat:no-repeat");
    } else if (node.style.background) {
      s.push(`background:${node.style.background}`);
    }

    // ========== 文本 ==========
    if (node.style.color) s.push(`color:${node.style.color}`);
    if (node.style.fontSize) s.push(`font-size:${node.style.fontSize}px`);
    if (node.style.fontFamily) s.push(`font-family:'${node.style.fontFamily}',sans-serif`);
    if (node.style.fontWeight) s.push(`font-weight:${node.style.fontWeight}`);
    if (node.style.lineHeight) s.push(`line-height:${node.style.lineHeight}px`);
    if (node.style.textAlign) s.push(`text-align:${node.style.textAlign}`);
    if (node.style.letterSpacing !== undefined) s.push(`letter-spacing:${node.style.letterSpacing}px`);
    if (node.style.textTransform) s.push(`text-transform:${node.style.textTransform}`);

    // ========== 圆角 ==========
    if (node.style.borderRadius) {
      const br = node.style.borderRadius;
      if (br.linked) {
        s.push(`border-radius:${br.topLeft}px`);
      } else {
        s.push(`border-radius:${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`);
      }
    }

    // ========== overflow ==========
    if (node.style.overflow) s.push(`overflow:${node.style.overflow}`);

    // ========== padding ==========
    if (node.style.padding) {
      const p = node.style.padding;
      s.push(`padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
    }

    // ========== margin ==========
    if (node.style.margin) {
      const m = node.style.margin;
      s.push(`margin:${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`);
    }

    // ========== box-shadow（从 meta.effectRef 或 style.boxShadow） ==========
    if (node.style.boxShadow) {
      s.push(`box-shadow:${node.style.boxShadow}`);
    }

    // ========== border ==========
    if (node.style.border) s.push(`border:${node.style.border}`);

    // ========== opacity ==========
    if (node.style.opacity !== undefined) s.push(`opacity:${node.style.opacity}`);

    // ========== icon 特殊样式 ==========
    if (isIcon) {
      s.push("display:flex");
      s.push("align-items:center");
      s.push("justify-content:center");
    }

    return s;
  }
}

// ========== 工具函数 ==========

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
