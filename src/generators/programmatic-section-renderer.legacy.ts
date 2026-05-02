/**
 * 程序化 Section 渲染器
 *
 * 核心渲染逻辑：直接从 DSL 数据生成像素级精确的 HTML/CSS
 * 不依赖 LLM，保留所有原始设计数据（SVG、阴影、多色文本等）
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import type { DSLAnalysis } from "./dsl-analyzer.js";
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
  analysis: DSLAnalysis,
): SectionRenderResult {
  const root = nodeMap.get(section.nodeId);
  if (!root) {
    return { html: `<!-- Section: ${section.name} (empty) -->`, css: "" };
  }

  const cssBuilder = new CSSBuilder(`sec-${section.id.replace("section-", "s")}`, nodeMap, analysis);

  // Determine semantic wrapper tag
  const sectionAnalysis = analysis.sections.find(a => a.id === section.id);
  const semanticGuess = sectionAnalysis?.semanticGuess ?? "content";
  const wrapperTag = semanticGuess === "navbar" ? "nav"
    : semanticGuess === "footer" ? "footer"
    : "section";
  const wrapperClass = semanticGuess;

  // Track heading levels used in this section
  const headingTracker = { used: new Set<string>() };

  const html = renderNode(root, nodeMap, originalData, cssBuilder, 0, headingTracker);

  return {
    html: `<${wrapperTag} class="${wrapperClass}" data-section-id="${section.id}" data-section-name="${escapeAttr(section.name)}">\n${html}\n</${wrapperTag}>`,
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
  analysis: DSLAnalysis,
): SectionRenderResult {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const allCSS: string[] = [];
  const allHTML: string[] = [];

  for (const section of sections) {
    const result = renderSectionProgrammatic(section, dsl, nodeMap, originalData, analysis);
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
  headingTracker?: { used: Set<string> },
): string {
  // icon 节点 — 渲染内联 SVG
  if (node.type === "icon" && node.meta?.svgPaths && node.meta.svgPaths.length > 0) {
    return renderIconNode(node, cssBuilder, depth);
  }

  // image 节点
  if (node.type === "image" && node.content?.src) {
    return renderImageNode(node, cssBuilder, depth);
  }

  // text 节点
  if (node.type === "text" && node.content?.text) {
    return renderTextNode(node, originalData, cssBuilder, depth, headingTracker);
  }

  // button 节点
  if (node.type === "button") {
    return renderContainerNode(node, "button", nodeMap, originalData, cssBuilder, depth, headingTracker);
  }

  // container 节点
  return renderContainerNode(node, "div", nodeMap, originalData, cssBuilder, depth, headingTracker);
}

function renderIconNode(node: DSLNode, cssBuilder: CSSBuilder, depth: number): string {
  const className = cssBuilder.addClass(node, depth);
  const w = typeof node.layout.width === "number" ? node.layout.width : 24;
  const h = typeof node.layout.height === "number" ? node.layout.height : 24;
  const svg = renderSvgIcon(node.meta!.svgPaths!, w, h);

  return `<div class="${className}" data-dsl-id="${node.id}">${svg}</div>`;
}

function renderImageNode(node: DSLNode, cssBuilder: CSSBuilder, depth: number): string {
  const className = cssBuilder.addClass(node, depth);
  const objectFit = node.style.objectFit || "cover";
  const src = node.content!.src!;
  const onerror = `var p=this.parentElement;p.style.background='linear-gradient(135deg,#e8e8e8 25%,#d0d0d0 50%,#e8e8e8 75%)';this.style.display='none'`;

  // If container has border-radius, add overflow:hidden for proper clipping
  if (node.style.borderRadius) {
    cssBuilder.addExtraRule(className, "overflow:hidden");
  }

  return `<div class="${className}" data-dsl-id="${node.id}"><img src="${escapeAttr(src)}" alt="${escapeAttr(node.name || "")}" style="display:block;width:100%;height:100%;object-fit:${objectFit}" onerror="${onerror}" /></div>`;
}

function renderTextNode(
  node: DSLNode,
  originalData: OriginalDslData | null,
  cssBuilder: CSSBuilder,
  depth: number,
  headingTracker?: { used: Set<string> },
): string {
  const className = cssBuilder.addClass(node, depth);
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

  // Choose semantic tag based on typography scale
  const tag = inferTextTag(node, cssBuilder.getAnalysis(), headingTracker);

  return `<${tag} class="${className}" data-dsl-id="${node.id}">${textContent}</${tag}>`;
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
  headingTracker?: { used: Set<string> },
): string {
  const className = cssBuilder.addClass(node, depth);

  // 递归渲染子节点
  const childrenHTML = node.children
    .map(id => nodeMap.get(id))
    .filter(Boolean)
    .map(child => renderNode(child!, nodeMap, originalData, cssBuilder, depth + 1, headingTracker))
    .join("\n");

  if (!childrenHTML && !node.content?.text) {
    return `<${tag} class="${className}" data-dsl-id="${node.id}" />`;
  }

  const inner = node.content?.text
    ? escapeHTML(node.content.text) + (childrenHTML ? "\n" + childrenHTML : "")
    : childrenHTML;

  return `<${tag} class="${className}" data-dsl-id="${node.id}">\n${inner}\n</${tag}>`;
}

// ========== 语义 HTML 推断 ==========

function inferTextTag(
  node: DSLNode,
  analysis: DSLAnalysis,
  headingTracker?: { used: Set<string> },
): string {
  const fontSize = node.style.fontSize;
  if (!fontSize) return "p";

  // Match against typography scale
  const match = analysis.typographyScale.find(t => t.size === fontSize);
  if (match) {
    const role = match.role;
    if (role === "display" || role === "h1") {
      const tag = "h1";
      if (headingTracker && headingTracker.used.has(tag)) return "p";
      headingTracker?.used.add(tag);
      return tag;
    }
    if (role === "h2") {
      const tag = "h2";
      if (headingTracker && headingTracker.used.has(tag)) return "p";
      headingTracker?.used.add(tag);
      return tag;
    }
    if (role === "h3") {
      const tag = "h3";
      if (headingTracker && headingTracker.used.has(tag)) return "p";
      headingTracker?.used.add(tag);
      return tag;
    }
    if (role === "small") return "small";
  }

  // Fallback: size-based heuristic
  if (fontSize >= 40) {
    const tag = "h1";
    if (headingTracker && headingTracker.used.has(tag)) return "p";
    headingTracker?.used.add(tag);
    return tag;
  }
  if (fontSize >= 28) {
    const tag = "h2";
    if (headingTracker && headingTracker.used.has(tag)) return "p";
    headingTracker?.used.add(tag);
    return tag;
  }
  if (fontSize >= 20) {
    const tag = "h3";
    if (headingTracker && headingTracker.used.has(tag)) return "p";
    headingTracker?.used.add(tag);
    return tag;
  }
  return "p";
}

// ========== 布局推断 ==========

type InferredLayout = {
  direction: "row" | "column";
  gap: number;
  align: string;
  justify: string;
};

/**
 * 从子节点的空间排列推断 flex 布局参数
 * 替代直接使用 position:relative + left/top 绝对定位
 */
function inferFlexLayout(
  parent: DSLNode,
  nodeMap: Map<string, DSLNode>,
): InferredLayout | null {
  if (!parent.children || parent.children.length < 2) return null;

  const children = parent.children
    .map(id => nodeMap.get(id))
    .filter((c): c is DSLNode => c != null && c.layout.x !== undefined && c.layout.y !== undefined);

  if (children.length < 2) return null;

  // Compute Y-overlap ratio to determine primary axis
  let totalOverlap = 0;
  let pairCount = 0;

  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];
      const aTop = a.layout.y ?? 0;
      const aBottom = aTop + (typeof a.layout.height === "number" ? a.layout.height : 0);
      const bTop = b.layout.y ?? 0;
      const bBottom = bTop + (typeof b.layout.height === "number" ? b.layout.height : 0);

      const overlapStart = Math.max(aTop, bTop);
      const overlapEnd = Math.min(aBottom, bBottom);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const minHeight = Math.min(aBottom - aTop, bBottom - bTop);

      totalOverlap += minHeight > 0 ? overlap / minHeight : 0;
      pairCount++;
    }
  }

  const avgOverlap = pairCount > 0 ? totalOverlap / pairCount : 0;

  let direction: "row" | "column";
  if (avgOverlap > 0.5) {
    direction = "row";
  } else if (avgOverlap < 0.3) {
    direction = "column";
  } else {
    // Mixed/overlapping — try column as default
    direction = "column";
  }

  // Sort children by position on primary axis
  const sorted = [...children].sort((a, b) => {
    if (direction === "row") return (a.layout.x ?? 0) - (b.layout.x ?? 0);
    return (a.layout.y ?? 0) - (b.layout.y ?? 0);
  });

  // Compute gaps between consecutive children
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (direction === "row") {
      const prevRight = (prev.layout.x ?? 0) + (typeof prev.layout.width === "number" ? prev.layout.width : 0);
      gaps.push((curr.layout.x ?? 0) - prevRight);
    } else {
      const prevBottom = (prev.layout.y ?? 0) + (typeof prev.layout.height === "number" ? prev.layout.height : 0);
      gaps.push((curr.layout.y ?? 0) - prevBottom);
    }
  }

  // Use median gap (more robust than mean)
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps.length > 0
    ? sortedGaps[Math.floor(sortedGaps.length / 2)]
    : 0;

  // Determine align-items from cross-axis alignment
  let align = "stretch";
  if (direction === "row") {
    const yValues = children.map(c => c.layout.y ?? 0);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    if (yMax - yMin < 5) {
      align = "flex-start";
    } else {
      // Check if children are centered relative to parent
      const parentH = typeof parent.layout.height === "number" ? parent.layout.height : 0;
      const avgCenter = children.reduce((sum, c) => {
        const cy = c.layout.y ?? 0;
        const ch = typeof c.layout.height === "number" ? c.layout.height : 0;
        return sum + cy + ch / 2;
      }, 0) / children.length;
      if (parentH > 0 && Math.abs(avgCenter - parentH / 2) < 10) {
        align = "center";
      }
    }
  } else {
    const xValues = children.map(c => c.layout.x ?? 0);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    if (xMax - xMin < 5) {
      align = "flex-start";
    } else {
      const parentW = typeof parent.layout.width === "number" ? parent.layout.width : 0;
      const avgCenter = children.reduce((sum, c) => {
        const cx = c.layout.x ?? 0;
        const cw = typeof c.layout.width === "number" ? c.layout.width : 0;
        return sum + cx + cw / 2;
      }, 0) / children.length;
      if (parentW > 0 && Math.abs(avgCenter - parentW / 2) < 10) {
        align = "center";
      }
    }
  }

  // Filter out negative gaps (overlapping elements — fallback to absolute)
  if (medianGap < -5) return null;

  return {
    direction,
    gap: Math.max(0, Math.round(medianGap)),
    align,
    justify: "flex-start",
  };
}

// ========== CSS Builder ==========

class CSSBuilder {
  private prefix: string;
  private counter = 0;
  private rules = new Map<string, string[]>();
  private extraRules = new Map<string, string[]>();
  private nodeMap: Map<string, DSLNode>;
  private analysis: DSLAnalysis;
  private valueToVar: Map<string, string>;
  // Metadata for responsive media queries
  private flexRowClasses: string[] = [];
  private headingClasses: Map<string, number> = new Map(); // className → original fontSize
  private cardClasses: string[] = [];

  constructor(prefix: string, nodeMap: Map<string, DSLNode>, analysis: DSLAnalysis) {
    this.prefix = prefix;
    this.nodeMap = nodeMap;
    this.analysis = analysis;

    // Build reverse lookup: raw CSS value → semantic variable name
    this.valueToVar = new Map();
    if (analysis.designSystem?.variables) {
      for (const [varName, rawValue] of analysis.designSystem.variables) {
        this.valueToVar.set(rawValue.toLowerCase(), varName);
      }
    }
  }

  /** Look up a raw value in the design system, return var() reference if found */
  private resolveVar(rawValue: string): string {
    const v = this.valueToVar.get(rawValue.toLowerCase());
    return v ? `var(${v})` : rawValue;
  }

  getAnalysis(): DSLAnalysis {
    return this.analysis;
  }

  addClass(node: DSLNode, depth: number = 0): string {
    const idx = this.counter++;
    const className = `${this.prefix}-${idx}`;
    const decls = this.generateDecls(node, depth);
    this.rules.set(className, decls);

    // Track metadata for responsive rules
    const isFlex = node.layout.mode === "flex";
    const isInferredFlex = node.layout.mode !== "flex" && node.type !== "text" && node.type !== "icon" && node.children.length >= 2;
    if (isFlex && node.layout.direction === "row" || (isInferredFlex)) {
      this.flexRowClasses.push(className);
    }
    if (node.type === "text" && node.style.fontSize && node.style.fontSize >= 20) {
      this.headingClasses.set(className, node.style.fontSize);
    }
    // Detect cards: containers with border-radius and image children
    if (node.type === "container" && node.style.borderRadius && node.children.some(id => {
      const c = this.nodeMap.get(id);
      return c?.type === "image";
    })) {
      this.cardClasses.push(className);
    }

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

    // Responsive media queries
    if (this.flexRowClasses.length > 0 || this.cardClasses.length > 0 || this.headingClasses.size > 0) {
      const tabletRules: string[] = [];
      const mobileRules: string[] = [];

      for (const cls of this.flexRowClasses) {
        tabletRules.push(`  .${cls} { flex-wrap: wrap; }`);
        mobileRules.push(`  .${cls} { flex-direction: column; }`);
      }
      for (const cls of this.cardClasses) {
        tabletRules.push(`  .${cls} { flex-basis: calc(50% - 8px); }`);
        mobileRules.push(`  .${cls} { flex-basis: 100%; }`);
      }
      for (const [cls, size] of this.headingClasses) {
        tabletRules.push(`  .${cls} { font-size: ${Math.round(size * 0.85)}px; }`);
        mobileRules.push(`  .${cls} { font-size: ${Math.round(size * 0.7)}px; }`);
      }

      if (tabletRules.length > 0) {
        blocks.push(`@media (max-width: 1024px) {\n${tabletRules.join("\n")}\n}`);
      }
      if (mobileRules.length > 0) {
        blocks.push(`@media (max-width: 640px) {\n${mobileRules.join("\n")}\n}`);
      }
    }

    return blocks.join("\n\n");
  }

  private generateDecls(node: DSLNode, depth: number = 0): string[] {
    const s: string[] = [];
    const isFlex = node.layout.mode === "flex";
    const isIcon = node.type === "icon";
    const pageWidth = this.analysis.page.width;

    // ========== 布局 ==========
    if (isFlex) {
      s.push("display:flex");
      if (node.layout.direction) s.push(`flex-direction:${node.layout.direction}`);
      if (node.layout.justify) s.push(`justify-content:${node.layout.justify}`);
      if (node.layout.align) s.push(`align-items:${node.layout.align}`);
      if (node.layout.wrap) s.push(`flex-wrap:${node.layout.wrap}`);
      if (node.layout.gap !== undefined) s.push(`gap:${node.layout.gap}px`);
    } else if (node.type !== "text" && node.type !== "icon") {
      // Infer flex layout from children's spatial arrangement
      const inferred = inferFlexLayout(node, this.nodeMap);
      if (inferred) {
        s.push("display:flex");
        s.push(`flex-direction:${inferred.direction}`);
        if (inferred.gap > 0) s.push(`gap:${inferred.gap}px`);
        if (inferred.align) s.push(`align-items:${inferred.align}`);
        if (inferred.justify) s.push(`justify-content:${inferred.justify}`);
      } else {
        // True absolute positioning (decorative/overlapping elements)
        s.push("position:relative");
        if (node.layout.x !== undefined) s.push(`left:${node.layout.x}px`);
        if (node.layout.y !== undefined) s.push(`top:${node.layout.y}px`);
      }
    }

    // ========== 尺寸 ==========
    const w = node.layout.width;
    const h = node.layout.height;

    if (w !== undefined && w !== "auto") {
      const wNum = typeof w === "number" ? w : parseInt(w, 10);
      if (!isNaN(wNum)) {
        // Full-width section roots → responsive
        if (wNum >= pageWidth - 10 && depth === 0) {
          s.push(`max-width:${wNum}px`);
          s.push("width:100%");
          s.push("margin:0 auto");
        } else {
          s.push(`width:${wNum}px`);
        }
      } else {
        s.push(`width:${w}`);
      }
    }
    if (h !== undefined && h !== "auto") s.push(`height:${typeof h === "number" ? h + "px" : h}`);
    if (node.layout.flexShrink !== undefined) s.push(`flex-shrink:${node.layout.flexShrink}`);

    // ========== 背景 ==========
    if (node.style.backgroundImage) {
      s.push(`background-image:url(${node.style.backgroundImage})`);
      s.push("background-size:cover");
      s.push("background-position:center");
      s.push("background-repeat:no-repeat");
    } else if (node.style.background) {
      s.push(`background:${this.resolveVar(node.style.background)}`);
    }

    // ========== 文本 ==========
    if (node.style.color) s.push(`color:${this.resolveVar(node.style.color)}`);
    if (node.style.fontSize) s.push(`font-size:${node.style.fontSize}px`);
    if (node.style.fontFamily) s.push(`font-family:var(--font-base,'${node.style.fontFamily}',sans-serif)`);
    if (node.style.fontWeight) s.push(`font-weight:${node.style.fontWeight}`);
    if (node.style.lineHeight) s.push(`line-height:${node.style.lineHeight}px`);
    if (node.style.textAlign) s.push(`text-align:${node.style.textAlign}`);
    if (node.style.letterSpacing !== undefined) s.push(`letter-spacing:${node.style.letterSpacing}px`);
    if (node.style.textTransform) s.push(`text-transform:${node.style.textTransform}`);

    // ========== 圆角 ==========
    if (node.style.borderRadius) {
      const br = node.style.borderRadius;
      if (br.linked) {
        const resolved = this.resolveVar(`${br.topLeft}px`);
        s.push(`border-radius:${resolved}`);
      } else {
        s.push(`border-radius:${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`);
      }
    }

    // ========== overflow ==========
    if (node.style.overflow) {
      s.push(`overflow:${node.style.overflow}`);
    } else if (node.style.borderRadius && node.type !== "text") {
      // Auto-add overflow:hidden for rounded containers (image clipping)
      s.push("overflow:hidden");
    }

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
