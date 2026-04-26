/**
 * React 代码生成器（v3 — 基于 LLM 语义化 Section）
 *
 * 集成 STORY-015 的 Design Tokens + Sections
 * 输出: App.tsx + App.css + sections/*.tsx
 *
 * 方法论：
 * - DSL → Token 提取 → Section 切分 → [LLM 语义重建] → React 组件
 * - 每个 Section 由 LLM 生成语义 HTML，再转换为 React JSX
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { extractDesignTokens, generateCSSTokenBlock, type DesignTokens } from "./token-extractor.js";
import { buildCSSClasses, generateCSSClassBlock, type CSSClassMap } from "./css-optimizer.js";
import { splitSections, type Section } from "./section-splitter.js";
import {
  generateAllSemanticSections,
  type SectionHTMLResult,
} from "./llm-section-html-generator.js";
import { LLMClient } from "../llm/llm-client.js";

export type ReactOutput = {
  appTSX: string;
  appCSS: string;
  sections: { fileName: string; code: string }[];
};

export type ReactOptions = {
  /** 启用 LLM 语义化生成（需要 LLM_API_KEY） */
  useLLM?: boolean;
  llmClient?: LLMClient;
};

/**
 * 生成完整的 React 代码（App.tsx + App.css + sections/）
 */
export async function generateReactApp(
  dsl: MachineDSL,
  options?: ReactOptions,
): Promise<ReactOutput> {
  const { page, nodes } = dsl;

  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) throw new Error("Root node not found");

  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  // Step 1: 提取 Tokens
  const tokens = extractDesignTokens(dsl);

  // Step 2: 构建 CSS 类（fallback 用）
  const classMap = buildCSSClasses(nodes, nodeMap, tokens);

  // Step 3: 识别 Sections
  const sections = splitSections(dsl);

  // Step 4: 尝试 LLM 语义化生成
  let semanticSections: Map<string, SectionHTMLResult> | null = null;

  if (options?.useLLM !== false) {
    try {
      semanticSections = await generateAllSemanticSections(
        dsl, sections, nodeMap, tokens,
        { llmClient: options?.llmClient },
      );
    } catch (err: any) {
      console.warn(`   ⚠️  LLM React 语义化生成失败，回退到机械翻译: ${err.message}`);
    }
  }

  // Step 5: 生成各 Section 组件
  const sectionComponents = await Promise.all(
    sections.map(async (section, idx) => {
      const sectionRoot = nodeMap.get(section.nodeId);
      if (!sectionRoot) return null;

      const componentName = toSectionComponentName(section.name, idx);
      const fileName = `${componentName}.tsx`;

      const semantic = semanticSections?.get(section.id);
      let jsx: string;

      if (semantic && semantic.html.trim()) {
        // 使用 LLM 语义 HTML → 转换为 React JSX
        jsx = htmlToJSX(semantic.html, 4);
      } else {
        // Fallback: 机械翻译
        jsx = renderNodeToJSX(sectionRoot, nodeMap, classMap, 4);
      }

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
    }),
  );

  const validSections = sectionComponents.filter((s): s is { fileName: string; code: string } => s !== null);

  // Step 6: 收集所有 CSS（tokens + 机械类 + LLM section CSS）
  const tokenCSS = generateCSSTokenBlock(tokens);
  const classCSS = generateCSSClassBlock(classMap);
  const uniqueCSS = generateUniqueNodeCSS(classMap);

  const llmCSS: string[] = [];
  if (semanticSections) {
    for (const [, result] of semanticSections) {
      if (result.css) llmCSS.push(result.css);
    }
  }

  const appCSS = `/* Design Tokens */
${tokenCSS}

/* Component Styles */
${classCSS}

/* Unique Node Styles */
${uniqueCSS}

/* LLM Section Styles */
${llmCSS.join("\n\n")}
`;

  // Step 7: 生成 App.tsx
  const imports = validSections.map(s => {
    const name = s.fileName.replace(".tsx", "");
    return `import { ${name} } from './sections/${name}';`;
  }).join("\n");

  const sectionJSX = validSections.map(s => {
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

  return { appTSX, appCSS, sections: validSections };
}

// ========== HTML → React JSX 转换 ==========

function htmlToJSX(html: string, baseIndent: number): string {
  const indentStr = "  ".repeat(baseIndent);

  // 简单转换：class → className，style string → style object 等
  let jsx = html
    .replace(/\sclass=/g, " className=")
    .replace(/\sfor=/g, " htmlFor=")
    .replace(/\sreadonly=/g, " readOnly=")
    .replace(/\smaxlength=/g, " maxLength=")
    .replace(/\sminlength=/g, " minLength=");

  // 处理自闭合标签
  jsx = jsx.replace(/<(img|br|hr|input|meta|link|area|base|col|embed|param|source|track|wbr)([^>]*)>/g, (_, tag, attrs) => {
    return `<${tag}${attrs} />`;
  });

  // 处理 style="..." → style={{...}}
  // 简单处理：把 style="key:value; key2:value2" 转换为 style={{key: 'value', key2: 'value2'}}
  // 这个转换比较复杂，先不做完整转换，保留 style string（React 也支持 style string 在 dangerouslySetInnerHTML 中）
  // 更好的做法：让 LLM 直接生成 JSX，或者保留 style string

  // 加缩进
  const lines = jsx.split("\n");
  return lines.map((line, i) => {
    if (i === 0) return indentStr + line;
    // 简单缩进：根据标签层级
    const openTags = (line.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (line.match(/<\/[^>]+>/g) || []).length;
    const selfClosing = (line.match(/<[^>]+\/>/g) || []).length;
    // 粗略缩进
    return indentStr + line;
  }).join("\n");
}

// ========== 机械翻译（fallback） ==========

function renderNodeToJSX(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  indent: number,
): string {
  const indentStr = "  ".repeat(indent);
  const tag = getJSXTag(node);
  const attrs = generateJSXAttrs(node, classMap);

  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style.objectFit || "cover";
    const imgSrc = node.content.src;
    const img = `<img src="${escapeJSXAttr(imgSrc)}" alt="${escapeJSXAttr(node.name || '')}" style={{ width: '100%', height: '100%', objectFit: '${objectFit}' }} />`;
    return `${indentStr}<${tag}${attrs}>\n${indentStr}  ${img}\n${indentStr}</${tag}>`;
  }

  let content = "";
  if (node.type === "text" && node.content?.text) {
    content = escapeJSXText(node.content.text);
  }

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

function generateJSXAttrs(node: DSLNode, classMap: CSSClassMap): string {
  const classNames: string[] = [];

  const extraClasses = classMap.nodeClasses.get(node.id);
  if (extraClasses) {
    classNames.push(...extraClasses);
  }

  const classStr = classNames.length > 0 ? classNames.join(" ") : `node-${node.id.slice(0, 8)}`;

  return ` className="${classStr}"`;
}

// ========== 工具函数 ==========

function toSectionComponentName(name: string, idx: number): string {
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
