/**
 * React 代码生成器（v2 — 基于 Section 拆分）
 *
 * 集成 STORY-015 的 Design Tokens + Sections
 * 输出: App.tsx + App.css + sections/*.tsx
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { extractDesignTokens, generateCSSTokenBlock, type DesignTokens } from "./token-extractor.js";
import { buildCSSClasses, generateCSSClassBlock, type CSSClassMap } from "./css-optimizer.js";
import { splitSections, type Section } from "./section-splitter.js";

export type ReactOutput = {
  appTSX: string;
  appCSS: string;
  sections: { fileName: string; code: string }[];
};

/**
 * 生成完整的 React 代码（App.tsx + App.css + sections/）
 */
export function generateReactApp(dsl: MachineDSL): ReactOutput {
  const { page, nodes } = dsl;

  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) throw new Error("Root node not found");

  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  // Step 1: 提取 Tokens
  const tokens = extractDesignTokens(dsl);

  // Step 2: 构建 CSS 类
  const classMap = buildCSSClasses(nodes, nodeMap, tokens);

  // Step 3: 识别 Sections
  const sections = splitSections(dsl);

  // Step 4: 生成各 Section 组件
  const sectionComponents = sections.map((section, idx) => {
    const sectionRoot = nodeMap.get(section.nodeId);
    if (!sectionRoot) return null;

    const componentName = toSectionComponentName(section.name, idx);
    const fileName = `${componentName}.tsx`;

    const jsx = renderNodeToJSX(sectionRoot, nodeMap, classMap, 4);

    const code = `import React from 'react';
import '../App.css';

export function ${componentName}() {
  return (
${jsx}
  );
}

export default ${componentName};
`;

    return { fileName, code };
  }).filter((s): s is { fileName: string; code: string } => s !== null);

  // Step 5: 生成 App.css
  const tokenCSS = generateCSSTokenBlock(tokens);
  const classCSS = generateCSSClassBlock(classMap);
  const uniqueCSS = generateUniqueNodeCSS(classMap);
  const appCSS = `/* Design Tokens */\n${tokenCSS}\n\n/* Component Styles */\n${classCSS}\n\n/* Unique Node Styles */\n${uniqueCSS}\n`;

  // Step 6: 生成 App.tsx
  const imports = sectionComponents.map(s => {
    const name = s.fileName.replace(".tsx", "");
    return `import { ${name} } from './sections/${name}';`;
  }).join("\n");

  const sectionJSX = sectionComponents.map(s => {
    const name = s.fileName.replace(".tsx", "");
    return `      <${name} />`;
  }).join("\n");

  const appTSX = `import React from 'react';
import './App.css';
${imports}

export function App() {
  return (
    <div>
${sectionJSX}
    </div>
  );
}

export default App;
`;

  return { appTSX, appCSS, sections: sectionComponents };
}

// ========== JSX 生成 ==========

function renderNodeToJSX(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  indent: number,
): string {
  const indentStr = "  ".repeat(indent);
  const tag = getJSXTag(node);
  const attrs = generateJSXAttrs(node, classMap);

  // 图片节点
  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style.objectFit || "cover";
    const imgSrc = node.content.src;
    const img = `<img src="${escapeJSXAttr(imgSrc)}" alt="${escapeJSXAttr(node.name || '')}" style={{ width: '100%', height: '100%', objectFit: '${objectFit}' }} />`;
    return `${indentStr}<${tag}${attrs}>\n${indentStr}  ${img}\n${indentStr}</${tag}>`;
  }

  // 文本内容
  let content = "";
  if (node.type === "text" && node.content?.text) {
    content = escapeJSXText(node.content.text);
  }

  // 子节点
  if (node.children.length > 0) {
    const childrenJSX = node.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(child => renderNodeToJSX(child!, nodeMap, classMap, indent + 1))
      .join("\n");

    if (content) {
      return `${indentStr}<${tag}${attrs}>${content}</${tag}>`;
    }
    if (!childrenJSX) {
      return `${indentStr}<${tag}${attrs} />`;
    }
    return `${indentStr}<${tag}${attrs}>\n${childrenJSX}\n${indentStr}</${tag}>`;
  }

  if (!content) {
    return `${indentStr}<${tag}${attrs} />`;
  }

  return `${indentStr}<${tag}${attrs}>${content}</${tag}>`;
}

function getJSXTag(node: DSLNode): string {
  switch (node.type) {
    case "button": return "button";
    case "text": return "p";
    default: return "div";
  }
}

/**
 * 生成 JSX 属性 — 使用 CSS 类名
 */
function generateJSXAttrs(node: DSLNode, classMap: CSSClassMap): string {
  const classNames: string[] = [];

  // 从 classMap 获取优化后的类名
  const extraClasses = classMap.nodeClasses.get(node.id);
  if (extraClasses) {
    classNames.push(...extraClasses);
  }

  // 没有共享类的节点 — 不使用内联样式，仍用类（CSS 文件中已定义）
  // 对于完全唯一的节点，CSS 类已在 App.css 中定义

  const classStr = classNames.length > 0 ? classNames.join(" ") : `node-${node.id.slice(0, 8)}`;

  return ` className="${classStr}"`;
}

// ========== 工具函数 ==========

function toSectionComponentName(name: string, idx: number): string {
  // 中文或特殊字符 → 用 Section0, Section1 ...
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(w => /^[a-zA-Z]/.test(w))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");

  if (cleaned.length >= 3) {
    return `${cleaned}Section`;
  }
  return `Section${idx + 1}`;
}

function escapeJSXText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
}

function escapeJSXAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function generateUniqueNodeCSS(classMap: CSSClassMap): string {
  const lines: string[] = [];
  for (const [nodeId, cssStr] of classMap.nodeInlineStyles) {
    const className = `node-${nodeId.slice(0, 8)}`;
    const formatted = cssStr.replace(/;/g, ";\n  ");
    lines.push(`.${className} {\n  ${formatted};\n}`);
  }
  return lines.join("\n\n");
}
