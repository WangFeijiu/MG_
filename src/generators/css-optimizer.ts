/**
 * CSS 优化器
 * 将节点的内联样式去重为 CSS 类，引用 Design Token 变量
 */

import type { DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";
import type { DesignTokens, TokenGroup } from "./token-extractor.js";

export type CSSClassMap = {
  /** 类名 → CSS 规则体 */
  classes: Map<string, string>;
  /** nodeId → 类名列表（空数组 = 用内联样式） */
  nodeClasses: Map<string, string[]>;
  /** nodeId → 内联 CSS 字符串（没被提取为类的节点） */
  nodeInlineStyles: Map<string, string>;
};

/**
 * 为所有节点生成去重的 CSS 类
 * 策略：只有 2+ 节点共享相同样式时才提取为类，否则保持内联
 */
export function buildCSSClasses(
  nodes: DSLNode[],
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
): CSSClassMap {
  const classes = new Map<string, string>();
  const nodeClasses = new Map<string, string[]>();
  const nodeInlineStyles = new Map<string, string>();

  // 第一遍：收集 style hash → nodeId 列表
  const hashToNodes = new Map<string, string[]>();
  const nodeToDecls = new Map<string, string[]>();

  for (const node of nodes) {
    const cssDecls = generateCSSDecls(node, nodeMap, tokens);
    if (cssDecls.length === 0) continue;

    const hash = cssDecls.join(";");
    nodeToDecls.set(node.id, cssDecls);

    const list = hashToNodes.get(hash);
    if (list) {
      list.push(node.id);
    } else {
      hashToNodes.set(hash, [node.id]);
    }
  }

  // 第二遍：只对 2+ 节点共享的样式创建类
  let classCounter = 0;
  for (const [hash, nodeIds] of hashToNodes) {
    const decls = nodeToDecls.get(nodeIds[0])!;
    if (nodeIds.length >= 2) {
      // 提取为共享类
      const prefix = getPrefix(nodes.find(n => n.id === nodeIds[0])!);
      const className = `${prefix}-${classCounter++}`;
      classes.set(className, decls.join(";\n  "));

      for (const nid of nodeIds) {
        nodeClasses.set(nid, [className]);
      }
    } else {
      // 保持内联
      nodeInlineStyles.set(nodeIds[0], decls.join(";"));
    }
  }

  return { classes, nodeClasses, nodeInlineStyles };
}

/**
 * 生成 CSS class 块
 */
export function generateCSSClassBlock(classMap: CSSClassMap): string {
  const lines: string[] = [];
  for (const [className, body] of classMap.classes) {
    lines.push(`.${className} {\n  ${body};\n}`);
  }
  return lines.join("\n\n");
}

// ========== 内部函数 ==========

function getPrefix(node: DSLNode): string {
  if (node.type === "text") return "dsl-t";
  if (node.type === "image") return "dsl-img";
  if (node.type === "button") return "dsl-btn";
  return "dsl-c";
}

/**
 * 为单个节点生成 CSS 声明数组（属性: 值）
 * 使用 Token 变量引用替代硬编码值
 */
function generateCSSDecls(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
): string[] {
  const s: string[] = [];

  const isFlexContainer = node.layout.mode === "flex";
  const isRowFlex = isFlexContainer && node.layout.direction === "row";
  const hasChildren = node.children.length > 0;
  const parentNode = node.parentId ? nodeMap.get(node.parentId) : null;
  const parentIsFlex = parentNode?.layout.mode === "flex";
  const isImageType = node.type === "image";

  // ========== 布局 ==========
  if (isFlexContainer) {
    s.push("display:flex");
    if (node.layout.direction) s.push(`flex-direction:${node.layout.direction}`);
    if (isRowFlex) {
      s.push(`justify-content:${node.layout.justify || "center"}`);
    } else if (node.layout.justify) {
      s.push(`justify-content:${node.layout.justify}`);
    }
    if (node.layout.align) s.push(`align-items:${node.layout.align}`);
    if (node.layout.wrap) s.push(`flex-wrap:${node.layout.wrap}`);
    if (node.layout.gap !== undefined) {
      const gapVal = tryToken(tokens.spacings, String(node.layout.gap), `${node.layout.gap}px`);
      s.push(`gap:${gapVal}`);
    }
  } else if (!parentIsFlex && node.type !== "text") {
    s.push("position:relative");
    if (node.layout.x !== undefined) s.push(`left:${node.layout.x}px`);
    if (node.layout.y !== undefined) s.push(`top:${node.layout.y}px`);
  }

  // ========== 尺寸 ==========
  const hasFixedW = node.layout.width !== undefined && node.layout.width !== "auto";
  const hasFixedH = node.layout.height !== undefined && node.layout.height !== "auto";

  if (isFlexContainer && hasChildren && hasFixedW) {
    s.push(`max-width:${formatSize(node.layout.width)}`);
    if (node.style.background || hasFixedH) {
      s.push(`min-height:${formatSize(node.layout.height)}`);
    }
  } else if (isImageType) {
    if (hasFixedW) s.push(`width:${formatSize(node.layout.width)}`);
    if (hasFixedH) s.push(`height:${formatSize(node.layout.height)}`);
  } else if (hasFixedW) {
    s.push(`width:${formatSize(node.layout.width)}`);
  }

  if (node.layout.flexShrink !== undefined) s.push(`flex-shrink:${node.layout.flexShrink}`);

  // ========== 背景 ==========
  if (node.type !== "image" && node.style.backgroundImage) {
    s.push(`background-image:url(${node.style.backgroundImage})`);
    s.push("background-size:cover");
    s.push("background-position:center");
    s.push("background-repeat:no-repeat");
  } else if (node.style.background) {
    const bgVal = tryToken(tokens.colors, node.style.background);
    s.push(`background:${bgVal}`);
  }

  // ========== 文本 ==========
  if (node.style.color) {
    const colorVal = tryToken(tokens.colors, node.style.color);
    s.push(`color:${colorVal}`);
  }
  if (node.style.fontSize) s.push(`font-size:${node.style.fontSize}px`);
  if (node.style.fontFamily) {
    const fontVar = tokens.fonts.lookup.get(node.style.fontFamily);
    if (fontVar) {
      s.push(`font-family:var(${fontVar})`);
    } else {
      s.push(`font-family:'${node.style.fontFamily}', sans-serif`);
    }
  }
  if (node.style.fontWeight) s.push(`font-weight:${node.style.fontWeight}`);
  if (node.style.lineHeight) s.push(`line-height:${node.style.lineHeight}px`);
  if (node.style.textAlign) s.push(`text-align:${node.style.textAlign}`);

  // ========== 圆角 ==========
  if (node.style.borderRadius) {
    const br = node.style.borderRadius;
    if (br.linked) {
      const raw = String(br.topLeft);
      const radiusVal = tryToken(tokens.radii, raw, `${br.topLeft}px`);
      s.push(`border-radius:${radiusVal}`);
    } else {
      const raw = `${br.topLeft}|${br.topRight}|${br.bottomRight}|${br.bottomLeft}`;
      const radiusVal = tryToken(tokens.radii, raw, `${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`);
      s.push(`border-radius:${radiusVal}`);
    }
  }

  // ========== overflow ==========
  if (node.style.overflow) s.push(`overflow:${node.style.overflow}`);

  // ========== padding ==========
  if (node.style.padding) {
    const p = node.style.padding;
    if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
      const val = tryToken(tokens.spacings, String(p.top), `${p.top}px`);
      s.push(`padding:${val}`);
    } else {
      s.push(`padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
    }
  }

  // ========== margin ==========
  if (node.style.margin) {
    const m = node.style.margin;
    s.push(`margin:${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`);
  }

  // ========== box-shadow ==========
  if (node.style.boxShadow) {
    const shadowVal = tryToken(tokens.shadows, node.style.boxShadow);
    s.push(`box-shadow:${shadowVal}`);
  }

  // ========== border ==========
  if (node.style.border) s.push(`border:${node.style.border}`);

  return s;
}

/**
 * 尝试从 token lookup 中查找变量引用，找不到就返回 fallback
 */
function tryToken(group: TokenGroup, raw: string, fallback?: string): string {
  const varName = group.lookup.get(raw);
  if (varName) return `var(${varName})`;
  return fallback ?? raw;
}

function formatSize(val: number | string | undefined): string {
  if (val === undefined) return "auto";
  return typeof val === "number" ? `${val}px` : val;
}
