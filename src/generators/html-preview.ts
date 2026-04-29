/**
 * 机器 DSL 到预览 HTML 的生成器（v6 — 程序化为主 + LLM 辅助）
 *
 * 数据流：
 * 1. 加载原始 DSL 数据（可选）
 * 2. 程序化分析 + section 拆分
 * 3. 程序化渲染（精确像素）
 * 4. [可选] LLM 语义化包装（小 prompt <8KB）
 * 5. 拼接完整页面
 *
 * 当原始 DSL 不可用时，回退到旧版 LLM 流程。
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { extractDesignTokens, generateCSSTokenBlock, type DesignTokens } from "./token-extractor.js";
import { buildCSSClasses, generateCSSClassBlock, type CSSClassMap } from "./css-optimizer.js";
import { splitSections, type Section } from "./section-splitter.js";
import {
  generateAllSemanticSections,
  type SectionHTMLResult,
} from "./llm-section-html-generator.js";
import { generateGlobalDesignSystem, type GlobalDesignSystem } from "./global-design-system.js";
import { LLMClient } from "../llm/llm-client.js";
import { analyzeDSL, type DSLAnalysis } from "./dsl-analyzer.js";
import { generatePageHTML } from "./llm-page-html-generator.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import { renderPageProgrammatic, type SectionRenderResult } from "./programmatic-section-renderer.js";

export type PreviewOptions = {
  useLLM?: boolean;
  llmClient?: LLMClient;
  /** 原始 DSL 数据（用于程序化渲染） */
  originalDslData?: OriginalDslData | null;
};

export async function generatePreviewHTML(
  dsl: MachineDSL,
  options?: PreviewOptions,
): Promise<string> {
  const { page, nodes } = dsl;
  const totalStart = Date.now();

  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) throw new Error("Root node not found");

  console.log(`\n[PreviewHTML] 开始生成 — Page: "${page.name}", ${nodes.length} nodes`);

  // Step 1: 程序化分析（纯计算，无 LLM）
  console.log("[PreviewHTML] Step 1: 程序化 DSL 分析...");
  const t1 = Date.now();
  const analysis = analyzeDSL(dsl);
  const sections = splitSections(dsl);
  console.log(`[PreviewHTML]   ✓ 分析完成: ${sections.length} sections, ${analysis.typographyScale.length} typography levels (${Date.now() - t1}ms)`);

  // Step 2: 程序化渲染（当有原始 DSL 数据时优先使用）
  const originalData = options?.originalDslData ?? null;

  if (originalData) {
    console.log("[PreviewHTML] Step 2: 程序化渲染（精确像素）...");
    const t2 = Date.now();
    const rendered = renderPageProgrammatic(dsl, sections, originalData);
    console.log(`[PreviewHTML]   ✓ 程序化渲染完成 (${Date.now() - t2}ms)`);

    // 组装完整页面
    const fullHTML = assemblePage(dsl, rendered, analysis);
    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
    console.log(`[PreviewHTML] 全部完成 — 总耗时 ${totalElapsed}s\n`);
    return fullHTML;
  }

  // === Fallback: 旧版 LLM 流程（无原始 DSL 数据时） ===
  console.log("[PreviewHTML] Step 2: 无原始 DSL 数据，使用 LLM 流程...");

  // 单次 LLM 整页生成
  if (options?.useLLM !== false && nodes.length <= 800) {
    console.log("[PreviewHTML]   → 尝试单次 LLM 整页生成...");
    const t2 = Date.now();
    try {
      const result = await generatePageHTML(analysis, sections);

      const elapsed = ((Date.now() - t2) / 1000).toFixed(1);
      console.log(`[PreviewHTML]   ✓ 整页生成完成 (${elapsed}s, ${result.usage.inputTokens + result.usage.outputTokens} tokens)`);

      const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
      console.log(`[PreviewHTML] 全部完成 — 总耗时 ${totalElapsed}s\n`);
      return result.html;
    } catch (err: any) {
      console.warn(`[PreviewHTML]   ⚠️ 整页生成失败: ${err.message}`);
      console.log("[PreviewHTML]   → 回退到 per-section 生成...");
    }
  } else if (nodes.length > 800) {
    console.log(`[PreviewHTML]   ⊘ 节点数 ${nodes.length} > 800，使用 per-section 模式`);
  } else {
    console.log("[PreviewHTML]   ⊘ LLM 已禁用，使用机械翻译");
  }

  // Fallback: per-section 生成
  return fallbackPerSectionGeneration(dsl, analysis, sections, options, totalStart);
}

// ========== 程序化渲染页面组装 ==========

function assemblePage(
  dsl: MachineDSL,
  rendered: SectionRenderResult,
  analysis: DSLAnalysis,
): string {
  const { page } = dsl;

  const unifiedCSS = [
    "/* Global Semantic Design System */",
    analysis.designSystem.rootCSS,
    "",
    "/* Base & Utilities */",
    analysis.designSystem.utilityCSS,
    "",
    "/* Legacy Design Tokens (fallback) */",
    generateCSSTokenBlock(analysis.tokens),
    "",
    "/* Programmatic Section Styles */",
    rendered.css,
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name} — Preview</title>
  ${analysis.designSystem.fontLinks || `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">`}
  <style>
    ${unifiedCSS}

    .dsl-node { transition: outline 0.15s ease; }
    .dsl-node:hover { outline: 2px solid rgba(59, 130, 246, 0.5); outline-offset: 2px; }
    .dsl-node.selected { outline: 2px solid rgb(59, 130, 246); outline-offset: 2px; }
  </style>
</head>
<body>
${rendered.html}
</body>
</html>`;
}

// ========== 旧版 Per-Section 生成（fallback） ==========

async function fallbackPerSectionGeneration(
  dsl: MachineDSL,
  analysis: DSLAnalysis,
  sections: Section[],
  options: PreviewOptions | undefined,
  totalStart: number,
): Promise<string> {
  const { page, nodes } = dsl;
  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  // LLM per-section
  console.log("[PreviewHTML] Step 2/4: LLM 语义化 Section 生成...");
  const t4 = Date.now();
  let semanticSections: Map<string, SectionHTMLResult> | null = null;

  if (options?.useLLM !== false) {
    try {
      semanticSections = await generateAllSemanticSections(
        dsl, sections, nodeMap, analysis.tokens, analysis.designSystem,
        { llmClient: options?.llmClient },
      );
    } catch (err: any) {
      console.warn(`[PreviewHTML]   ⚠️ LLM 语义化生成失败: ${err.message}`);
    }
  }
  console.log(`[PreviewHTML]   ✓ Step 2 完成 (${Date.now() - t4}ms)`);

  // 机械 CSS
  console.log("[PreviewHTML] Step 3/4: 构建机械 CSS 类...");
  const t5 = Date.now();
  const classMap = buildCSSClasses(nodes, nodeMap, analysis.tokens);
  console.log(`[PreviewHTML]   ✓ ${classMap.classes.size} 个 CSS 类 (${Date.now() - t5}ms)`);

  // 拼接
  console.log("[PreviewHTML] Step 4/4: 拼接 Section HTML...");
  const t6 = Date.now();
  const sectionMap = new Map<string, Section>();
  for (const sec of sections) {
    for (const nid of sec.nodeIds) sectionMap.set(nid, sec);
  }

  const sectionHTMLs: string[] = [];
  const llmCoveredNodeIds = new Set<string>();
  let llmSectionCount = 0;
  let fallbackSectionCount = 0;

  for (const section of sections) {
    const semantic = semanticSections?.get(section.id);

    if (semantic && semantic.html.trim()) {
      sectionHTMLs.push(`<!-- Section: ${section.name} -->\n${semantic.html}`);
      for (const nid of section.nodeIds) llmCoveredNodeIds.add(nid);
      llmSectionCount++;
    } else {
      const sectionRoot = nodeMap.get(section.nodeId);
      if (sectionRoot) {
        const html = renderNode(sectionRoot, nodeMap, classMap, sectionMap);
        sectionHTMLs.push(`<!-- Section: ${section.name} (mechanical) -->\n${html}`);
      }
      fallbackSectionCount++;
    }
  }
  console.log(`[PreviewHTML]   ✓ LLM: ${llmSectionCount}, Fallback: ${fallbackSectionCount} (${Date.now() - t6}ms)`);

  // CSS 组装
  const tokenCSS = generateCSSTokenBlock(analysis.tokens);
  const filteredClassCSS = filterCoveredClasses(classMap, llmCoveredNodeIds);

  const unifiedCSS = [
    "/* Global Semantic Design System */",
    analysis.designSystem.rootCSS,
    "",
    "/* Base & Utilities */",
    analysis.designSystem.utilityCSS,
    "",
    "/* Legacy Design Tokens (fallback) */",
    tokenCSS,
    "",
    "/* Component Styles (mechanical fallback) */",
    filteredClassCSS,
  ].join("\n");

  const bodyHTML = sectionHTMLs.join("\n\n");
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`[PreviewHTML] 全部完成 (fallback) — 总耗时 ${totalElapsed}s\n`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name} — Preview</title>
  ${analysis.designSystem.fontLinks || `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">`}
  <style>
    ${unifiedCSS}

    .dsl-node { transition: outline 0.15s ease; }
    .dsl-node:hover { outline: 2px solid rgba(59, 130, 246, 0.5); outline-offset: 2px; }
    .dsl-node.selected { outline: 2px solid rgb(59, 130, 246); outline-offset: 2px; }
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}

// ========== CSS 工具 ==========

function filterCoveredClasses(classMap: CSSClassMap, coveredNodeIds: Set<string>): string {
  const lines: string[] = [];
  for (const [className, body] of classMap.classes) {
    let allCovered = true;
    for (const [nodeId, classes] of classMap.nodeClasses) {
      if (classes.includes(className) && !coveredNodeIds.has(nodeId)) {
        allCovered = false;
        break;
      }
    }
    if (!allCovered) {
      lines.push(`.${className} {\n  ${body};\n}`);
    }
  }
  return lines.join("\n\n");
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
