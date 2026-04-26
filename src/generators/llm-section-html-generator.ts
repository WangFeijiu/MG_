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
import type { GlobalDesignSystem } from "./global-design-system.js";
import { LLMClient } from "../llm/llm-client.js";
import { buildCompactTree } from "./tree-formatter.js";

export type SectionHTMLResult = {
  html: string;
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
  globalSystem: GlobalDesignSystem,
  neighbors: { prev?: string; next?: string },
  options?: {
    llmClient?: LLMClient;
    skipCache?: boolean;
  },
): Promise<SectionHTMLResult> {
  const cacheKey = hashSection(section, dsl.nodes);
  if (!options?.skipCache && sectionCache.has(cacheKey)) {
    return sectionCache.get(cacheKey)!;
  }

  const sectionRoot = nodeMap.get(section.nodeId);
  if (!sectionRoot) {
    return { html: "", classNames: [], semanticTag: "div" };
  }

  const llm = options?.llmClient ?? new LLMClient({ maxTokens: 16384 });

  const prompt = buildSectionPrompt(section, sectionRoot, nodeMap, tokens, kind, dsl.page, globalSystem, neighbors);
  const startMs = Date.now();

  try {
    console.log(`   [LLM] 开始生成 [${section.name}] (${section.nodeIds.length} nodes)...`);
    const response = await llm.chatWithRetry(
      [{ role: "user", content: prompt }],
      SYSTEM_PROMPT,
      2,
    );
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    const tokens = response.usage.inputTokens + response.usage.outputTokens;

    const result = parseLLMOutput(response.text, section.name);
    if (!result.html) {
      console.warn(`   ⚠️  [LLM] 生成结果无效 [${section.name}] (${elapsed}s, ${tokens} tokens) → fallback 机械翻译`);
      return { html: "", classNames: [], semanticTag: "div" };
    }

    console.log(`   ✓ [LLM] 生成完成 [${section.name}] (${elapsed}s, ${tokens} tokens, ${result.classNames.length} classes)`);
    sectionCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.warn(`   ✗ [LLM] 生成失败 [${section.name}] (${elapsed}s): ${err.message} → fallback 机械翻译`);
    return { html: "", classNames: [], semanticTag: "div" };
  }
}

const SYSTEM_PROMPT = `You are an expert frontend developer converting design specs into clean, semantic HTML.

CRITICAL RULES:
1. Use semantic HTML5 tags: nav, header, section, article, main, aside, footer, h1-h6, p, button, a, img, ul/li, figure/figcaption
2. Use meaningful, kebab-case class names: .navbar, .hero-title, .btn-primary, .feature-card, .section-header
3. ONLY use CSS variables from the provided Global Design System — DO NOT create new color/spacing values
4. Use the shared utility classes when applicable: .container, .btn-primary, .btn-secondary, .section-header
5. Match layout structure with flexbox/grid
6. Preserve ALL text content exactly
7. Use actual image URLs from the design
8. Responsive: use max-width containers, not fixed widths for main content
9. ONLY output the section HTML, no <html>/<head>/<body> wrapper
10. NO <style> tags — all styles use the shared CSS variables and utility classes
11. Return ONLY a code block, no explanation

Output format:
<section class="section-name">
  <!-- semantic HTML using shared utility classes and CSS vars -->
</section>`;

function buildSectionPrompt(
  section: Section,
  root: DSLNode,
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
  kind: SectionKind,
  page: MachineDSL["page"],
  globalSystem: GlobalDesignSystem,
  neighbors: { prev?: string; next?: string },
): string {
  const treeStr = buildCompactTree(root, nodeMap, 0);

  // 收集相邻 section 信息
  const neighborInfo: string[] = [];
  if (neighbors.prev) neighborInfo.push(`Previous section: "${neighbors.prev}"`);
  if (neighbors.next) neighborInfo.push(`Next section: "${neighbors.next}"`);

  return `Convert this design section into clean, semantic HTML.

## Global Design System (SHARED — use these exact variables and classes)
${globalSystem.rootCSS}

## Shared Utility Classes
.container { max-width: var(--content-width); margin: 0 auto; padding: 0 24px; }
.section-header { text-align: center; max-width: 960px; margin: 0 auto 48px; }
.btn-primary { display: inline-flex; align-items: center; justify-content: center; background: var(--text-primary); color: var(--white); padding: 14px 32px; border-radius: var(--radius-lg); font-size: 16px; font-weight: 600; }
.btn-secondary { display: inline-flex; align-items: center; justify-content: center; background: var(--surface-6); color: var(--text-primary); padding: 14px 32px; border-radius: var(--radius-lg); font-size: 16px; font-weight: 500; }

## Page Context
- Page: "${page.name}", width: ${page.width}px
- Section: "${section.name}" (position ${parseInt(section.id.replace("section-", "")) + 1} of page)
${neighborInfo.length > 0 ? "- " + neighborInfo.join("\n- ") : ""}
- Section type: ${kind}
- Section nodes: ${section.nodeIds.length}

## Section Structure
${treeStr}

## Instructions
1. Analyze the section and determine its semantic purpose (navbar, hero, features, testimonials, footer, CTA, etc.)
2. Use the most appropriate HTML5 semantic tag as the root: <nav>, <section>, <header>, <footer>, <article>
3. Class names must be meaningful and consistent: .navbar, .hero-content, .btn-primary, .feature-title, .testimonial-card
4. Use ONLY the CSS variables from the Global Design System above — never hardcode colors or spacing
5. For centered content, wrap in <div class="container"> using the shared utility class
6. Buttons should use .btn-primary or .btn-secondary classes when stylistically appropriate
7. Section headers should use .section-header structure when applicable
8. Match the layout structure (flex direction, gaps, alignment) from the design
9. Include all text and images exactly as specified
10. Output ONLY the HTML section, no wrapper html/head/body tags, no <style> tags

Generate the semantic HTML now:`;
}

/**
 * 解析 LLM 输出，提取 HTML
 */
function parseLLMOutput(text: string, _sectionName: string): SectionHTMLResult {
  let html = text.trim();

  html = html.replace(/^```html\s*\n?/i, "");
  html = html.replace(/^```\s*\n?/, "");
  html = html.replace(/\n?```\s*$/, "");

  const classNames: string[] = [];
  const classRegex = /class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = classRegex.exec(html)) !== null) {
    m[1].split(/\s+/).forEach(c => {
      if (c && !classNames.includes(c)) classNames.push(c);
    });
  }

  const tagMatch = html.match(/^\s*<([a-zA-Z0-9-]+)/);
  const semanticTag = tagMatch ? tagMatch[1] : "section";

  // 拒绝包含 <style> 的输出（应该使用共享 CSS）
  if (html.includes("<style")) {
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").trim();
  }

  if (!isValidHTML(html)) {
    return { html: "", classNames: [], semanticTag: "div" };
  }

  return { html, classNames, semanticTag };
}

function isValidHTML(html: string): boolean {
  const tagPairs = ["section", "div", "nav", "header", "footer", "article", "main"];
  for (const tag of tagPairs) {
    const open = (html.match(new RegExp(`<${tag}[^>]*>`, "gi")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    if (open !== close) return false;
  }
  return true;
}

/**
 * 批量生成所有 Section 的语义 HTML（并行）
 */
export async function generateAllSemanticSections(
  dsl: MachineDSL,
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
  tokens: DesignTokens,
  globalSystem: GlobalDesignSystem,
  options?: {
    llmClient?: LLMClient;
    classifyFn?: (types: string[]) => string;
    skipCache?: boolean;
  },
): Promise<Map<string, SectionHTMLResult>> {
  const classify = options?.classifyFn ?? defaultClassify;
  const results = new Map<string, SectionHTMLResult>();

  const CONCURRENCY = 3;
  console.log(`\n[Section Generation] 共 ${sections.length} 个 Section，并发 ${CONCURRENCY} 路 LLM 生成...`);
  const totalStart = Date.now();

  async function runWithConcurrency<T>(items: T[], fn: (item: T) => Promise<void>, limit: number) {
    const queue = [...items];
    const workers: Promise<void>[] = [];

    for (let i = 0; i < Math.min(limit, queue.length); i++) {
      workers.push(worker());
    }

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift()!;
        await fn(item);
      }
    }

    await Promise.all(workers);
  }

  await runWithConcurrency(sections, async (section) => {
    const root = nodeMap.get(section.nodeId);
    if (!root) return;

    const types = collectNodeTypes(root, nodeMap);
    const kind = classify(types) as SectionKind;

    const idx = sections.findIndex(s => s.id === section.id);
    const neighbors = {
      prev: idx > 0 ? sections[idx - 1].name : undefined,
      next: idx < sections.length - 1 ? sections[idx + 1].name : undefined,
    };

    const result = await generateSemanticSectionHTML(
      section, dsl, nodeMap, tokens, kind, globalSystem, neighbors, options,
    );
    results.set(section.id, result);
  }, CONCURRENCY);

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  const successCount = sections.filter(s => results.get(s.id)?.html).length;
  const fallbackCount = sections.length - successCount;
  console.log(`[Section Generation] 全部完成 (${totalElapsed}s) — LLM: ${successCount}, Fallback: ${fallbackCount}\n`);

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
