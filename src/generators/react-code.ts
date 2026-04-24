/**
 * 机器 DSL 到 React 代码生成器
 * 生成高还原度的 React 组件代码
 * 支持多种样式模式：inline / tailwind / module-scss / plain-css
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";
import type { GenConfig, StyleMode, ComponentMatch } from "../types/gen-config.js";
import { DEFAULT_GEN_CONFIG } from "./default-config.js";
import { getMatchedComponent, hasMatch } from "./component-match.js";

export type ReactCodeOptions = {
  config?: GenConfig;
  componentMatches?: ComponentMatch[];
};

interface StyleResult {
  className?: string;
  style?: Record<string, any>;
  cssRule?: string;
}

interface GenerationResult {
  code: string;
  cssFile?: string;
  cssContent?: string;
}

/**
 * 生成 React 组件代码
 */
export function generateReactCode(
  dsl: MachineDSL,
  options?: ReactCodeOptions
): GenerationResult {
  const { page, nodes } = dsl;
  const config = options?.config ?? DEFAULT_GEN_CONFIG;
  const matches = options?.componentMatches ?? [];
  const styleMode = config.styleMode ?? "inline";

  // 找到根节点
  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) {
    throw new Error("Root node not found");
  }

  // 构建节点映射
  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // 生成组件代码
  const componentName = toPascalCase(page.name);
  const cssMap = new Map<string, string>();
  const { jsx, cssRules } = renderNodeToJSX(rootNode, nodeMap, 2, styleMode, matches, cssMap);

  // 生成导入语句
  const imports = generateImports(config, matches, styleMode);

  // 生成样式文件
  let cssFile: string | undefined;
  let cssContent: string | undefined;

  if (styleMode === "module-scss" && cssRules.size > 0) {
    cssFile = "App.module.scss";
    cssContent = generateSCSS(cssRules);
  } else if (styleMode === "plain-css" && cssRules.size > 0) {
    cssFile = "App.css";
    cssContent = generatePlainCSS(cssRules);
  }

  const code = `${imports}

export function ${componentName}() {
  return (
${jsx}
  );
}

export default ${componentName};
`;

  return { code, cssFile, cssContent };
}

/**
 * 生成导入语句
 */
function generateImports(
  config: GenConfig,
  matches: ComponentMatch[],
  styleMode: StyleMode
): string {
  const imports: string[] = ["import React from 'react';"];

  // 组件导入
  const componentImports = new Set<string>();
  for (const match of matches) {
    componentImports.add(match.componentName);
  }
  if (componentImports.size > 0) {
    const compList = Array.from(componentImports).sort().join(", ");
    imports.push(`import { ${compList} } from './components';`);
  }

  // 样式文件导入
  if (styleMode === "module-scss") {
    imports.push("import styles from './App.module.scss';");
  } else if (styleMode === "plain-css") {
    imports.push("import './App.css';");
  }

  return imports.join("\n");
}

/**
 * 渲染节点为 JSX
 */
function renderNodeToJSX(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  indent: number,
  styleMode: StyleMode,
  matches: ComponentMatch[],
  cssMap: Map<string, string>
): { jsx: string; cssRules: Map<string, string> } {
  const indentStr = "  ".repeat(indent);
  const cssRules = new Map<string, string>();

  // 选择标签
  const tag = getJSXTag(node, matches);
  const useComponent = hasMatch(node.id, matches);

  // 生成样式
  const { className, style, cssRule } = generateStyle(node, nodeMap, styleMode, useComponent, cssMap);

  // 生成 JSX 属性
  const attributes = generateJSXAttributes(node, style, className || "", styleMode);

  // 生成内容
  let content = "";

  // 文本内容
  if (node.content?.text) {
    content = node.content.text;
  }

  // 图片内容
  if (node.content?.src) {
    const imgSrc = toProxyPath(node.content.src);
    content = `\n${indentStr}  <img src="${imgSrc}" alt="${node.name || ''}" style={{ width: '100%', height: '100%', objectFit: '${node.style.objectFit || 'cover'}' }} />\n${indentStr}`;
  }

  // 子节点
  let childrenJSX = "";
  if (node.children.length > 0) {
    for (const childId of node.children) {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        const childResult = renderNodeToJSX(childNode, nodeMap, indent + 1, styleMode, matches, cssMap);
        for (const [k, v] of childResult.cssRules) {
          cssRules.set(k, v);
        }
        childrenJSX += childResult.jsx + "\n";
      }
    }
  }

  // 收集 CSS 规则
  if (cssRule) {
    cssRules.set(cssRule.split("{")[0].trim(), cssRule);
  }

  // 构建 JSX
  if (!content && !childrenJSX) {
    return { jsx: `${indentStr}<${tag}${attributes} />`, cssRules };
  }

  if (childrenJSX) {
    return {
      jsx: `${indentStr}<${tag}${attributes}>\n${childrenJSX}${indentStr}</${tag}>`,
      cssRules,
    };
  }

  return { jsx: `${indentStr}<${tag}${attributes}>${content}</${tag}>`, cssRules };
}

/**
 * 获取 JSX 标签
 */
function getJSXTag(node: DSLNode, matches: ComponentMatch[]): string {
  // 优先使用匹配到的组件
  const matchedComponent = getMatchedComponent(node.id, matches);
  if (matchedComponent) {
    return matchedComponent;
  }

  // 使用 meta.componentHint
  if (node.meta?.componentHint) {
    return node.meta.componentHint;
  }

  switch (node.type) {
    case "button":
      return "button";
    case "text":
      return "p";
    case "image":
      return "div";
    default:
      return "div";
  }
}

/**
 * 生成样式
 */
function generateStyle(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  styleMode: StyleMode,
  useComponent: boolean,
  cssMap: Map<string, string>
): StyleResult {
  const styleObj: Record<string, any> = {};
  let className = node.type;
  let cssRule: string | undefined;

  const isFlexContainer = node.layout.mode === "flex";
  const isRowFlex = isFlexContainer && node.layout.direction === "row";
  const hasChildren = node.children.length > 0;
  const parentNode = node.parentId ? nodeMap.get(node.parentId) : null;
  const parentIsFlex = parentNode?.layout.mode === "flex";
  const isImageType = node.type === "image";

  // 生成唯一类名
  const nodeClassName = `node-${node.id.slice(0, 8)}`;

  // ========== 布局模式 ==========
  if (isFlexContainer) {
    if (styleMode === "tailwind") {
      className += " flex";
      if (node.layout.direction === "row") {
        className += " flex-row";
      } else if (node.layout.direction === "column") {
        className += " flex-col";
      }
      if (node.layout.justify) {
        className += ` ${tailwindJustify(node.layout.justify)}`;
      }
      if (node.layout.align) {
        className += ` ${tailwindAlign(node.layout.align)}`;
      }
      if (node.layout.wrap) {
        className += " flex-wrap";
      }
      if (node.layout.gap !== undefined) {
        className += ` gap-${gapToTailwind(node.layout.gap)}`;
      }
    } else {
      styleObj.display = "flex";
      if (node.layout.direction) styleObj.flexDirection = node.layout.direction;
      if (isRowFlex) {
        styleObj.justifyContent = node.layout.justify || "center";
      } else if (node.layout.justify) {
        styleObj.justifyContent = node.layout.justify;
      }
      if (node.layout.align) styleObj.alignItems = node.layout.align;
      if (node.layout.wrap) styleObj.flexWrap = node.layout.wrap;
      if (node.layout.gap !== undefined) styleObj.gap = `${node.layout.gap}px`;
    }
  } else if (!parentIsFlex && node.type !== "text") {
    if (styleMode === "tailwind") {
      className += " relative";
    } else {
      styleObj.position = "relative";
    }
    if (node.layout.x !== undefined) {
      if (styleMode === "tailwind") {
        className += ` left-${node.layout.x}`;
      } else {
        styleObj.left = `${node.layout.x}px`;
      }
    }
    if (node.layout.y !== undefined) {
      if (styleMode === "tailwind") {
        className += ` top-${node.layout.y}`;
      } else {
        styleObj.top = `${node.layout.y}px`;
      }
    }
  }

  // ========== 尺寸 ==========
  const hasFixedW = node.layout.width !== undefined && node.layout.width !== "auto";
  const hasFixedH = node.layout.height !== undefined && node.layout.height !== "auto";

  if (isFlexContainer && hasChildren && hasFixedW) {
    if (styleMode === "tailwind") {
      const w = typeof node.layout.width === "number" ? node.layout.width : 0;
      className += ` max-w-${sizeToTailwind(w)}`;
    } else {
      styleObj.maxWidth = typeof node.layout.width === "number"
        ? `${node.layout.width}px` : node.layout.width;
    }
    if (node.style.background || hasFixedH) {
      const h = typeof node.layout.height === "number" ? node.layout.height : 0;
      if (styleMode === "tailwind") {
        className += ` min-h-${sizeToTailwind(h)}`;
      } else {
        styleObj.minHeight = typeof node.layout.height === "number"
          ? `${node.layout.height}px` : node.layout.height;
      }
    }
  } else if (isImageType) {
    if (hasFixedW) {
      const w = typeof node.layout.width === "number" ? node.layout.width : 0;
      if (styleMode === "tailwind") {
        className += ` w-${sizeToTailwind(w)}`;
      } else {
        styleObj.width = typeof node.layout.width === "number"
          ? `${node.layout.width}px` : node.layout.width;
      }
    }
    if (hasFixedH) {
      const h = typeof node.layout.height === "number" ? node.layout.height : 0;
      if (styleMode === "tailwind") {
        className += ` h-${sizeToTailwind(h)}`;
      } else {
        styleObj.height = typeof node.layout.height === "number"
          ? `${node.layout.height}px` : node.layout.height;
      }
    }
  } else if (hasFixedW) {
    const w = typeof node.layout.width === "number" ? node.layout.width : 0;
    if (styleMode === "tailwind") {
      className += ` w-${sizeToTailwind(w)}`;
    } else {
      styleObj.width = typeof node.layout.width === "number"
        ? `${node.layout.width}px` : node.layout.width;
    }
  }

  // flexShrink
  if (parentIsFlex && node.layout.flexShrink !== undefined) {
    if (styleMode === "tailwind") {
      className += ` shrink-${node.layout.flexShrink === 0 ? "none" : ""}`;
    } else {
      styleObj.flexShrink = node.layout.flexShrink;
    }
  }

  // ========== 背景 ==========
  if (node.style.backgroundImage) {
    if (styleMode === "tailwind") {
      className += " bg-cover bg-center bg-no-repeat";
    } else {
      styleObj.backgroundImage = `url(scene.png)`;
      styleObj.backgroundSize = "cover";
      styleObj.backgroundPosition = "center";
      styleObj.backgroundRepeat = "no-repeat";
    }
  } else if (node.style.background) {
    if (styleMode === "tailwind") {
      className += ` ${parseBackgroundToTailwind(node.style.background)}`;
    } else {
      styleObj.background = node.style.background;
    }
  }

  // ========== 文本样式 ==========
  if (node.style.color) {
    if (styleMode === "tailwind") {
      className += ` ${parseColorToTailwind(node.style.color)}`;
    } else {
      styleObj.color = node.style.color;
    }
  }
  if (node.style.fontSize) {
    const fs = node.style.fontSize;
    if (styleMode === "tailwind") {
      className += ` text-${fontSizeToTailwind(fs)}`;
    } else {
      styleObj.fontSize = `${fs}px`;
    }
  }
  if (node.style.fontFamily) {
    styleObj.fontFamily = `'${node.style.fontFamily}', sans-serif`;
  }
  if (node.style.fontWeight) {
    if (styleMode === "tailwind") {
      className += ` font-${fontWeightToTailwind(node.style.fontWeight)}`;
    } else {
      styleObj.fontWeight = node.style.fontWeight;
    }
  }
  if (node.style.lineHeight) styleObj.lineHeight = `${node.style.lineHeight}px`;
  if (node.style.textAlign) {
    if (styleMode === "tailwind") {
      className += ` text-${node.style.textAlign}`;
    } else {
      styleObj.textAlign = node.style.textAlign;
    }
  }

  // ========== 圆角 ==========
  if (node.style.borderRadius) {
    const br = node.style.borderRadius;
    if (styleMode === "tailwind") {
      const radius = br.linked ? br.topLeft : Math.min(br.topLeft, br.topRight, br.bottomRight, br.bottomLeft);
      className += ` rounded-${borderRadiusToTailwind(radius)}`;
    } else {
      if (br.linked) {
        styleObj.borderRadius = `${br.topLeft}px`;
      } else {
        styleObj.borderRadius = `${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`;
      }
    }
  }

  // ========== overflow ==========
  if (node.style.overflow) {
    if (styleMode === "tailwind") {
      className += ` overflow-${node.style.overflow}`;
    } else {
      styleObj.overflow = node.style.overflow;
    }
  }

  // ========== padding ==========
  if (node.style.padding) {
    const p = node.style.padding;
    if (styleMode === "tailwind") {
      if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
        className += ` p-${sizeToTailwind(p.top)}`;
      } else {
        className += ` px-${sizeToTailwind(p.left)} py-${sizeToTailwind(p.top)}`;
      }
    } else {
      if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
        styleObj.padding = `${p.top}px`;
      } else {
        styleObj.padding = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
      }
    }
  }

  // ========== margin ==========
  if (node.style.margin) {
    const m = node.style.margin;
    if (styleMode === "tailwind") {
      className += ` mx-${sizeToTailwind(m.left)} my-${sizeToTailwind(m.top)}`;
    } else {
      styleObj.margin = `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`;
    }
  }

  // ========== box-shadow ==========
  if (node.style.boxShadow) {
    if (styleMode === "tailwind") {
      className += " shadow-md";
    } else {
      styleObj.boxShadow = node.style.boxShadow;
    }
  }

  // ========== border ==========
  if (node.style.border) {
    if (styleMode === "tailwind") {
      className += " border";
    } else {
      styleObj.border = node.style.border;
    }
  }

  // 根据模式返回不同结果
  if (styleMode === "module-scss" || styleMode === "plain-css") {
    const cssClassName = `styles.${nodeClassName}`;
    cssRule = `.${nodeClassName} { ${cssObjectToString(styleObj)} }`;
    return { className: cssClassName, cssRule };
  } else if (styleMode === "tailwind") {
    return { className: className.trim() };
  }

  // inline 模式
  return { className, style: styleObj };
}

/**
 * 生成 JSX 属性
 */
function generateJSXAttributes(
  node: DSLNode,
  styleObj: Record<string, any> | undefined,
  className: string,
  styleMode: StyleMode
): string {
  const attrs: string[] = [];

  // className
  if (styleMode === "module-scss" || styleMode === "plain-css") {
    attrs.push(`className={${className}}`);
  } else if (styleMode === "tailwind") {
    attrs.push(`className="${className}"`);
  } else {
    attrs.push(`className="${node.type}"`);
  }

  // style (仅 inline 模式)
  if (styleMode === "inline" && styleObj && Object.keys(styleObj).length > 0) {
    const styleStr = JSON.stringify(styleObj, null, 0);
    attrs.push(`style={${styleStr}}`);
  }

  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}

/**
 * Tailwind 工具函数
 */
function tailwindJustify(justify: string): string {
  const map: Record<string, string> = {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    "center": "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
  };
  return map[justify] || "";
}

function tailwindAlign(align: string): string {
  const map: Record<string, string> = {
    "flex-start": "items-start",
    "flex-end": "items-end",
    "center": "items-center",
    "stretch": "items-stretch",
  };
  return map[align] || "";
}

function sizeToTailwind(px: number): string {
  if (px <= 0) return "0";
  if (px === 4) return "1";
  if (px === 8) return "2";
  if (px === 12) return "3";
  if (px === 16) return "4";
  if (px === 20) return "5";
  if (px === 24) return "6";
  if (px === 32) return "8";
  if (px === 40) return "10";
  if (px === 48) return "12";
  if (px === 64) return "16";
  if (px === 80) return "20";
  return Math.round(px / 4).toString();
}

function gapToTailwind(px: number): string {
  return sizeToTailwind(px);
}

function fontSizeToTailwind(px: number): string {
  if (px <= 12) return "xs";
  if (px === 14) return "sm";
  if (px === 16) return "base";
  if (px === 18) return "lg";
  if (px === 20) return "xl";
  if (px === 24) return "2xl";
  if (px === 28) return "3xl";
  if (px === 32) return "4xl";
  return Math.round(px / 4).toString();
}

function fontWeightToTailwind(weight: string | number): string {
  if (weight === "normal" || weight === 400) return "normal";
  if (weight === "medium" || weight === 500) return "medium";
  if (weight === "semibold" || weight === 600) return "semibold";
  if (weight === "bold" || weight === 700) return "bold";
  return "normal";
}

function borderRadiusToTailwind(px: number): string {
  if (px === 0) return "none";
  if (px === 2) return "sm";
  if (px === 4) return "md";
  if (px === 6) return "lg";
  if (px === 8) return "xl";
  if (px === 12) return "2xl";
  if (px === 16) return "3xl";
  return "none";
}

function parseBackgroundToTailwind(bg: string): string {
  if (bg.startsWith("#")) {
    return "bg-gray-100"; // 默认灰色，可扩展
  }
  if (bg.includes("rgba") || bg.includes("rgb")) {
    return "bg-gray-100";
  }
  return "bg-gray-100";
}

function parseColorToTailwind(color: string): string {
  if (color.startsWith("#")) {
    return "text-gray-800";
  }
  if (color.includes("blue")) return "text-blue-500";
  if (color.includes("red")) return "text-red-500";
  if (color.includes("green")) return "text-green-500";
  if (color.includes("gray")) return "text-gray-500";
  return "text-gray-800";
}

function cssObjectToString(obj: Record<string, any>): string {
  return Object.entries(obj)
    .map(([k, v]) => {
      const cssKey = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${cssKey}: ${v};`;
    })
    .join(" ");
}

/**
 * 生成 SCSS 文件
 */
function generateSCSS(cssRules: Map<string, string>): string {
  const lines: string[] = [
    "// Auto-generated styles",
    "// Note: Compile with your SCSS pipeline",
    "",
  ];
  for (const rule of cssRules.values()) {
    lines.push(rule);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * 生成普通 CSS 文件
 */
function generatePlainCSS(cssRules: Map<string, string>): string {
  const lines: string[] = [
    "/* Auto-generated styles */",
    "",
  ];
  for (const rule of cssRules.values()) {
    lines.push(rule);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * 返回相对路径 scene.png（避免跨域）
 */
function toProxyPath(url: string): string {
  return "scene.png";
}

/**
 * 转换为 PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
