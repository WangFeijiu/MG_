/**
 * 机器 DSL 到 React 代码生成器
 * 生成高还原度的 React 组件代码
 * 支持多种样式模式：inline / tailwind / module-scss / plain-css
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";
import type { GenConfig, StyleMode, ComponentMatch } from "../types/gen-config.js";
import { DEFAULT_GEN_CONFIG } from "./default-config.js";
import { getMatchedComponent, hasMatch } from "./component-match.js";
import {
  sizeToTailwind, gapToTailwind, fontSizeToTailwind, fontWeightToTailwind,
  borderRadiusToTailwind, parseBackgroundToTailwind, parseColorToTailwind,
  tailwindJustify, tailwindAlign,
} from "./tailwind-utils.js";

export type ReactCodeOptions = {
  config?: GenConfig;
  componentMatches?: ComponentMatch[];
  imageMap?: Map<string, string>;
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
  const imageMap = options?.imageMap ?? new Map();
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
  const { jsx, cssRules } = renderNodeToJSX(rootNode, nodeMap, 2, styleMode, matches, cssMap, imageMap);

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
  cssMap: Map<string, string>,
  imageMap: Map<string, string>
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
    const imgSrc = imageMap.get(node.id) || toProxyPath(node.content.src);
    content = `\n${indentStr}  <img src="${imgSrc}" alt="${node.name || ''}" style={{ width: '100%', height: '100%', objectFit: '${node.style.objectFit || 'cover'}' }} />\n${indentStr}`;
  }

  // 子节点
  let childrenJSX = "";
  if (node.children.length > 0) {
    for (const childId of node.children) {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        const childResult = renderNodeToJSX(childNode, nodeMap, indent + 1, styleMode, matches, cssMap, imageMap);
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
      // 使用 imageMap 中的路径，如果没有则使用默认
      const bgImagePath = "scene.png";
      styleObj.backgroundImage = `url(${bgImagePath})`;
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

  // 文本截断处理
  if (node.content?.text && node.layout.width) {
    const textLength = node.content.text.length;
    const estimatedWidth = typeof node.layout.width === "number" ? node.layout.width : 0;

    // 如果文本可能超出容器，添加截断样式
    if (textLength > 50 && estimatedWidth < 300) {
      if (styleMode === "tailwind") {
        className += " truncate";
      } else {
        styleObj.overflow = "hidden";
        styleObj.textOverflow = "ellipsis";
        styleObj.whiteSpace = "nowrap";
      }
    }
  }

  // ========== 圆角 ==========
  if (node.style.borderRadius) {
    const br = node.style.borderRadius;
    if (styleMode === "tailwind") {
      // 检查是否是完全圆形（所有角都是很大的值）
      if (br.topLeft >= 9999 || (br.linked && br.topLeft >= 100)) {
        className += " rounded-full";
      } else if (br.linked) {
        // 对称圆角
        className += ` rounded-${borderRadiusToTailwind(br.topLeft)}`;
      } else {
        // 非对称圆角 - 使用单独的类
        const tl = borderRadiusToTailwind(br.topLeft);
        const tr = borderRadiusToTailwind(br.topRight);
        const br_val = borderRadiusToTailwind(br.bottomRight);
        const bl = borderRadiusToTailwind(br.bottomLeft);

        // 如果所有角相同，使用 rounded
        if (tl === tr && tr === br_val && br_val === bl) {
          className += ` rounded-${tl}`;
        } else {
          // 使用单独的角类
          if (tl) className += ` rounded-tl-${tl}`;
          if (tr) className += ` rounded-tr-${tr}`;
          if (br_val) className += ` rounded-br-${br_val}`;
          if (bl) className += ` rounded-bl-${bl}`;
        }
      }
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
      // 根据阴影值判断阴影大小
      const shadow = node.style.boxShadow.toLowerCase();
      if (shadow.includes("0px 0px") || shadow.includes("0 0")) {
        // 无阴影
      } else if (shadow.includes("1px") || shadow.includes("2px")) {
        className += " shadow-sm";
      } else if (shadow.includes("10px") || shadow.includes("12px") || shadow.includes("15px")) {
        className += " shadow-lg";
      } else if (shadow.includes("20px") || shadow.includes("25px")) {
        className += " shadow-xl";
      } else if (shadow.includes("30px") || shadow.includes("40px") || shadow.includes("50px")) {
        className += " shadow-2xl";
      } else {
        className += " shadow-md";
      }
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

  // ========== opacity ==========
  if (node.style.opacity !== undefined && node.style.opacity < 1) {
    if (styleMode === "tailwind") {
      const opacityValue = Math.round(node.style.opacity * 100);
      if (opacityValue === 0) className += " opacity-0";
      else if (opacityValue <= 5) className += " opacity-5";
      else if (opacityValue <= 10) className += " opacity-10";
      else if (opacityValue <= 20) className += " opacity-20";
      else if (opacityValue <= 25) className += " opacity-25";
      else if (opacityValue <= 30) className += " opacity-30";
      else if (opacityValue <= 40) className += " opacity-40";
      else if (opacityValue <= 50) className += " opacity-50";
      else if (opacityValue <= 60) className += " opacity-60";
      else if (opacityValue <= 70) className += " opacity-70";
      else if (opacityValue <= 75) className += " opacity-75";
      else if (opacityValue <= 80) className += " opacity-80";
      else if (opacityValue <= 90) className += " opacity-90";
      else if (opacityValue <= 95) className += " opacity-95";
      else className += " opacity-100";
    } else {
      styleObj.opacity = node.style.opacity;
    }
  }

  // ========== cursor ==========
  if (node.style.cursor) {
    if (styleMode === "tailwind") {
      className += ` cursor-${node.style.cursor}`;
    } else {
      styleObj.cursor = node.style.cursor;
    }
  }

  // ========== 根据语义类型添加交互样式 ==========
  if (node.meta?.semanticType === "button") {
    if (styleMode === "tailwind") {
      className += " cursor-pointer hover:opacity-90 transition-opacity";
    } else {
      styleObj.cursor = "pointer";
      styleObj.transition = "opacity 0.2s";
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
