/**
 * LLM 语义化 Section HTML 生成器
 *
 * 方法论：先分块 → 局部语义重建 → 全局拼接
 * 每个 Section 独立调用 LLM，生成语义化 HTML（有意义的 class 名、语义标签）
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { DesignTokens } from "./token-extractor.js";
import type { Section } from "./section-splitter.js";
import type { SectionKind } from "../validators/tolerance.js";
import { LLMClient } from "../llm/llm-client.js";

export type SectionHTMLResult = {
  html: string;
  css: string;
  classNames: string[];
  semanticTag: string;
};

const sectionCache = new Map<string, SectionHTMLResult>();

function hashSection(section: Section, nodes: DSLNode[]): string {
  const relevant = nodes.filter(n => section.nodeIds.includes(n.id));
  const data = JSON.stringify({
    id: section.id,
    name: section.name,
    nodeCount: relevant.length,
    texts: relevant.filter(n => n.type === "text").map(n => n.content?.text),
  });
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h + data.charCodeAt(i)) | 0;
  }
  return String(h);
}

/**
 * 为单个 Section 生成语义化 HTML
 */
export async function generateSemanticSectionHTML(
  section: Section,
  dsl: MachineDSL,
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
  kind: SectionKind,
  options?: {
    llmClient?: LLMClient;
    skipCache?: boolean;
  },
): Promise<SectionHTMLResult> {
  const cacheKey = hashSection(section, dsl.nodes);
  if (!options?.skipCache && sectionCache.has(cacheKey)) {
    return sectionCache.get(cacheKey)!;
  }

  // 收集 Section 的节点树
  const sectionRoot = nodeMap.get(section.nodeId);
  if (!sectionRoot) {
    return { html: "", css: "", classNames: [], semanticTag: "div" };
  }

  const llm = options?.llmClient ?? new LLMClient();

  const prompt = buildSectionPrompt(section, sectionRoot, nodeMap, tokens, kind, dsl.page);

  try {
    const response = await llm.chatWithRetry(
      [{ role: "user", content: prompt }],
      SYSTEM_PROMPT,
      2,
    );

    const result = parseLLMOutput(response.text, section.name);
    sectionCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    console.warn(`   ⚠️  LLM Section 生成失败 [${section.name}]: ${err.message}`);
    // fallback: 返回空，让调用方用机械翻译兜底
    return { html: "", css: "", classNames: [], semanticTag: "div" };
  }
}

const SYSTEM_PROMPT = `You are an expert frontend developer specializing in converting design specifications into clean, semantic HTML with CSS.

Rules:
1. Use semantic HTML5 tags: nav, header, section, article, main, aside, footer, h1-h6, p, button, a, img, ul/li, figure/figcaption
2. Use meaningful, kebab-case class names that describe the UI element (e.g., .navbar, .hero-title, .btn-primary, .feature-card)
3. Use CSS custom properties (var(--name)) for design tokens
4. Use flexbox/grid for layouts matching the design structure
5. Preserve all text content exactly
6. Use actual image URLs from the design
7. Responsive: prefer max-width containers over fixed widths
8. Only output the section HTML, no <html>/<head>/<body> wrapper
9. Return ONLY a code block, no explanation

Output format:
<section class="section-name">
  <!-- semantic HTML -->
</section>`;

function buildSectionPrompt(
  section: Section,
  root: DSLNode,
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
  kind: SectionKind,
  page: MachineDSL["page"],
): string {
  const treeStr = buildCompactTree(root, nodeMap, 0);
  const tokenStr = buildTokenSummary(tokens);

  return `Convert this design section into clean, semantic HTML with CSS.

## Context
- Page: "${page.name}", width: ${page.width}px
- Section: "${section.name}"
- Section type: ${kind}
- Section nodes: ${section.nodeIds.length}

## Design Tokens
${tokenStr}

## Section Structure
${treeStr}

## Instructions
1. Analyze the section structure and determine its semantic purpose (navbar, hero, features, testimonials, footer, etc.)
2. Use the most appropriate HTML5 semantic tag as the root (<nav>, <section>, <header>, <footer>, etc.)
3. Class names should be meaningful: .navbar, .hero-content, .btn-primary, .feature-title, etc.
4. Use the design tokens as CSS variables
5. Match the layout structure (flex direction, gaps, alignment)
6. Include all text and images exactly
7. Output ONLY the HTML section, no wrapper html/head/body tags

Generate the semantic HTML now:`;
}

function buildCompactTree(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  depth: number,
): string {
  const indent = "  ".repeat(depth);
  const type = node.type;
  const name = node.name || "unnamed";

  let details = "";

  // 布局
  const layoutParts: string[] = [];
  if (node.layout.mode) layoutParts.push(`mode:${node.layout.mode}`);
  if (node.layout.direction) layoutParts.push(`dir:${node.layout.direction}`);
  if (node.layout.justify) layoutParts.push(`justify:${node.layout.justify}`);
  if (node.layout.align) layoutParts.push(`align:${node.layout.align}`);
  if (node.layout.gap !== undefined) layoutParts.push(`gap:${node.layout.gap}`);
  if (node.layout.width !== undefined) layoutParts.push(`w:${node.layout.width}`);
  if (node.layout.height !== undefined) layoutParts.push(`h:${node.layout.height}`);

  // 样式
  const styleParts: string[] = [];
  if (node.style.background) styleParts.push(`bg:${truncate(node.style.background, 30)}`);
  if (node.style.color) styleParts.push(`color:${node.style.color}`);
  if (node.style.fontSize) styleParts.push(`fs:${node.style.fontSize}px`);
  if (node.style.fontWeight) styleParts.push(`fw:${node.style.fontWeight}`);
  if (node.style.borderRadius) styleParts.push(`radius:${node.style.borderRadius.topLeft}px`);
  if (node.style.padding) styleParts.push(`pad:${node.style.padding.top}/${node.style.padding.right}/${node.style.padding.bottom}/${node.style.padding.left}`);

  // 内容
  let content = "";
  if (node.content?.text) content = ` text:"${truncate(node.content.text, 50)}"`;
  if (node.content?.src) content = ` img:"${truncate(node.content.src, 40)}"`;

  const layoutStr = layoutParts.length > 0 ? ` [${layoutParts.join(", ")}]` : "";
  const styleStr = styleParts.length > 0 ? ` {${styleParts.join(", ")}}` : "";

  let result = `${indent}${type} "${name}"${layoutStr}${styleStr}${content}`;

  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) {
      result += "\n" + buildCompactTree(child, nodeMap, depth + 1);
    }
  }

  return result;
}

function buildTokenSummary(tokens: DesignTokens): string {
  const lines: string[] = [];

  if (tokens.colors.variables.size > 0) {
    lines.push("Colors:");
    for (const [name, value] of tokens.colors.variables) {
      lines.push(`  ${name}: ${value}`);
    }
  }

  if (tokens.fonts.variables.size > 0) {
    lines.push("Fonts:");
    for (const [name, value] of tokens.fonts.variables) {
      lines.push(`  ${name}: ${value}`);
    }
  }

  if (tokens.spacings.variables.size > 0) {
    lines.push("Spacings:");
    for (const [name, value] of tokens.spacings.variables) {
      lines.push(`  ${name}: ${value}`);
    }
  }

  if (tokens.radii.variables.size > 0) {
    lines.push("Radii:");
    for (const [name, value] of tokens.radii.variables) {
      lines.push(`  ${name}: ${value}`);
    }
  }

  return lines.join("\n") || "  (no tokens extracted)";
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

/**
 * 解析 LLM 输出，提取 HTML + CSS
 */
function parseLLMOutput(text: string, sectionName: string): SectionHTMLResult {
  // 提取代码块
  const codeBlockMatch = text.match(/```(?:html)?\s*\n?([\s\S]*?)```/);
  const html = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  // 提取所有 class 名
  const classNames: string[] = [];
  const classRegex = /class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = classRegex.exec(html)) !== null) {
    m[1].split(/\s+/).forEach(c => {
      if (c && !classNames.includes(c)) classNames.push(c);
    });
  }

  // 提取根标签
  const tagMatch = html.match(/^<([a-zA-Z0-9-]+)/);
  const semanticTag = tagMatch ? tagMatch[1] : "section";

  // CSS 通常在 style 标签内或单独块
  const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1].trim() : "";

  return { html, css, classNames, semanticTag };
}

/**
 * 批量生成所有 Section 的语义 HTML（并行）
 */
export async function generateAllSemanticSections(
  dsl: MachineDSL,
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
  options?: {
    llmClient?: LLMClient;
    classifyFn?: (types: string[]) => string;
    skipCache?: boolean;
  },
): Promise<Map<string, SectionHTMLResult>> {
  const classify = options?.classifyFn ?? defaultClassify;
  const results = new Map<string, SectionHTMLResult>();

  // 并行生成所有 section
  const promises = sections.map(async (section) => {
    const root = nodeMap.get(section.nodeId);
    if (!root) return;

    const types = collectNodeTypes(root, nodeMap);
    const kind = classify(types) as SectionKind;

    const result = await generateSemanticSectionHTML(
      section, dsl, nodeMap, tokens, kind, options,
    );
    results.set(section.id, result);
  });

  await Promise.all(promises);
  return results;
}

function defaultClassify(types: string[]): string {
  const set = new Set(types);
  const hasText = set.has("text");
  const hasImage = set.has("image");
  if (hasText && hasImage) return "mixed";
  if (hasText) return "text";
  if (hasImage) return "image";
  return "layout";
}

function collectNodeTypes(node: DSLNode, nodeMap: Map<string, DSLNode>): string[] {
  const types: string[] = [node.type];
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) types.push(...collectNodeTypes(child, nodeMap));
  }
  return types;
}
