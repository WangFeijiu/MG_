/**
 * 机器 DSL 到预览 HTML 的生成器（v3 — LLM 语义化 Section 生成）
 *
 * 方法论：
 * - DSL → Token 提取 → Section 切分 → [LLM 语义重建] → CSS 统一 → 页面拼接
 * - 每个 Section 独立调用 LLM 生成语义化 HTML
 * - LLM 失败时 fallback 到机械翻译
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

export type PreviewOptions = {
  /** 启用 LLM 语义化生成（需要 LLM_API_KEY） */
  useLLM?: boolean;
  llmClient?: LLMClient;
};

export async function generatePreviewHTML(
  dsl: MachineDSL,
  options?: PreviewOptions,
): Promise<string> {
  const { page, nodes } = dsl;

  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) throw new Error("Root node not found");

  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  // Step 1: 提取 Design Tokens
  const tokens = extractDesignTokens(dsl);

  // Step 2: 识别 Sections
  const sections = splitSections(dsl);

  // Step 3: 尝试 LLM 语义化生成
  let semanticSections: Map<string, SectionHTMLResult> | null = null;

  if (options?.useLLM !== false) {
    try {
      semanticSections = await generateAllSemanticSections(
        dsl, sections, nodeMap, tokens,
        { llmClient: options?.llmClient },
      );
    } catch (err: any) {
      console.warn(`   ⚠️  LLM 语义化生成失败，回退到机械翻译: ${err.message}`);
    }
  }

  // Step 4: 构建 CSS 类（机械翻译 fallback 用）
  const classMap = buildCSSClasses(nodes, nodeMap, tokens);

  // Step 5: 生成各 Section HTML
  const sectionMap = new Map<string, Section>();
  for (const sec of sections) {
    for (const nid of sec.nodeIds) sectionMap.set(nid, sec);
  }

  const sectionHTMLs: string[] = [];
  const sectionCSS: string[] = [];

  for (const section of sections) {
    const semantic = semanticSections?.get(section.id);

    if (semantic && semantic.html.trim()) {
      // 使用 LLM 生成的语义 HTML
      sectionHTMLs.push(`<!-- Section: ${section.name} -->\n${semantic.html}`);
      if (semantic.css) sectionCSS.push(semantic.css);
    } else {
      // Fallback: 机械翻译
      const sectionRoot = nodeMap.get(section.nodeId);
      if (sectionRoot) {
        const html = renderNode(sectionRoot, nodeMap, classMap, sectionMap);
        sectionHTMLs.push(`<!-- Section: ${section.name} (mechanical) -->\n${html}`);
      }
    }
  }

  // Step 6: 统一 CSS
  const tokenCSS = generateCSSTokenBlock(tokens);
  const classCSS = generateCSSClassBlock(classMap);

  const unifiedCSS = [
    "/* Design Tokens */",
    tokenCSS,
    "",
    "/* Component Styles */",
    classCSS,
    "",
    "/* LLM Section Styles */",
    ...sectionCSS,
  ].join("\n");

  const bodyHTML = sectionHTMLs.join("\n\n");

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

    ${unifiedCSS}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}

// ========== 机械翻译（fallback） ==========

function renderNode(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  sectionMap: Map<string, Section>,
): string {
  const tag = getHTMLTag(node);
  const attrs = generateAttributes(node, classMap, sectionMap);

  let content = "";

  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style.objectFit || "cover";
    const onerror = `var p=this.parentElement;p.style.background='linear-gradient(135deg,#e8e8e8 25%,#d0d0d0 50%,#e8e8e8 75%)';this.style.display='none'`;
    content = `<img src="${escapeAttr(node.content.src)}" alt="${escapeAttr(node.name || '')}" style="display:block; width:100%; height:100%; object-fit:${objectFit};" onerror="${onerror}" />`;
    return `<${tag}${attrs}>${content}</${tag}>`;
  }

  if (node.type === "text" && node.content?.text) {
    content = escapeHTML(node.content.text);
  }

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

function generateAttributes(
  node: DSLNode,
  classMap: CSSClassMap,
  sectionMap: Map<string, Section>,
): string {
  const classParts = ["dsl-node", `dsl-${node.type}`];

  const extraClasses = classMap.nodeClasses.get(node.id);
  if (extraClasses) {
    classParts.push(...extraClasses);
  }

  const parts = [
    `class="${classParts.join(" ")}"`,
  ];

  const inlineStyle = classMap.nodeInlineStyles.get(node.id);
  if (inlineStyle) {
    parts.push(`style="${inlineStyle}"`);
  }

  parts.push(`data-dsl-id="${node.id}"`);
  parts.push(`data-dsl-type="${node.type}"`);
  if (node.name) parts.push(`data-dsl-name="${escapeAttr(node.name)}"`);

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
