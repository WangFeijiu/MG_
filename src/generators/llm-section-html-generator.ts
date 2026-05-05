/**
 * LLM 语义化 Section HTML 生成器
 *
 * 输入: SectionManifest (精确像素) + SectionSemantics (语义角色)
 * 输出: 语义化 HTML
 *
 * LLM 负责"把 Manifest 翻译成 HTML"，不负责"看图猜布局"
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { DesignTokens } from "./token-extractor.js";
import type { Section } from "./section-splitter.js";
import type { SectionKind } from "../validators/tolerance.js";
import type { GlobalDesignSystem } from "./global-design-system.js";
import type { SectionManifest } from "./section-manifest.js";
import type { SectionSemantics } from "./llm-semantic-analyzer.js";
import { LLMClient } from "../llm/llm-client.js";

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
    manifest?: SectionManifest;
    semantics?: SectionSemantics | null;
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

  const llm = options?.llmClient ?? new LLMClient({ maxTokens: 32768 });

  const prompt = buildSectionPrompt(
    section, options?.manifest!, options?.semantics ?? null,
    kind, dsl.page, globalSystem, neighbors,
  );
  const startMs = Date.now();

  try {
    console.log(`   [LLM] 开始生成 [${section.name}] (${section.nodeIds.length} nodes)...`);
    const response = await llm.chatWithRetry(
      [{ role: "user", content: prompt }],
      SYSTEM_PROMPT,
      2,
    );
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    const outTokens = response.usage.inputTokens + response.usage.outputTokens;

    const result = parseLLMOutput(response.text, section.name);
    if (!result.html) {
      console.warn(`   ⚠️  [LLM] 生成结果无效 [${section.name}] (${elapsed}s, ${outTokens} tokens) → fallback`);
      return { html: "", classNames: [], semanticTag: "div" };
    }

    console.log(`   ✓ [LLM] 生成完成 [${section.name}] (${elapsed}s, ${outTokens} tokens, ${result.classNames.length} classes)`);
    sectionCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.warn(`   ✗ [LLM] 生成失败 [${section.name}] (${elapsed}s): ${err.message} → fallback`);
    return { html: "", classNames: [], semanticTag: "div" };
  }
}

const SYSTEM_PROMPT = `You are an expert frontend developer translating a design specification (JSON) into pixel-accurate, semantic HTML.

CRITICAL RULES:
1. **Follow the spec exactly** — use the precise bounds, padding, gap, fontSize, colors from the JSON. Do NOT guess or approximate.
2. Use semantic HTML5 tags: nav, header, section, article, main, aside, footer, h1-h6, p, button, a, img, ul/li, figure/figcaption
3. Use meaningful, kebab-case class names based on the semantic analysis provided
4. Match CSS variables from the Design System when a color/spacing value matches; use inline styles for spec-specific values
5. Match layout EXACTLY: flex direction, gap, padding, justify, align from the manifest
6. Preserve ALL text content and image URLs exactly as provided
7. Be CONCISE — minimal wrapper divs, no unnecessary nesting
8. Output ONLY the section HTML, no <html>/<head>/<body> wrapper, no <style> tags, no explanation`;

function buildSectionPrompt(
  section: Section,
  manifest: SectionManifest,
  semantics: SectionSemantics | null,
  kind: SectionKind,
  page: MachineDSL["page"],
  globalSystem: GlobalDesignSystem,
  neighbors: { prev?: string; next?: string },
): string {
  const manifestJSON = JSON.stringify(manifest, null, 2);

  const neighborInfo: string[] = [];
  if (neighbors.prev) neighborInfo.push(`Previous section: "${neighbors.prev}"`);
  if (neighbors.next) neighborInfo.push(`Next section: "${neighbors.next}"`);

  // 语义分析块
  let semanticBlock = "";
  if (semantics) {
    const elements = semantics.keyElements
      .map(e => `  - node "${e.nodeId}" → ${e.role} ${e.nodeType}${e.textPreview ? ` ("${e.textPreview.slice(0, 40)}")` : ""}`)
      .join("\n");

    semanticBlock = `
## Semantic Analysis (pre-computed)
- Section type: ${semantics.semanticType}
- Purpose: ${semantics.purpose}
- Suggested root tag: <${semantics.suggestedRootTag} class="${semantics.suggestedClassName}">
- Key elements:
${elements}
`;
  }

  return `Convert this design section into pixel-accurate, semantic HTML.

## Global Design System (CSS variables — use these when values match)
${globalSystem.rootCSS}

## Page Context
- Page: "${page.name}", width: ${page.width}px
- Section: "${section.name}" (position ${parseInt(section.id.replace("section-", "")) + 1} of page)
${neighborInfo.length > 0 ? "- " + neighborInfo.join("\n- ") : ""}
- Content type: ${kind}
${semanticBlock}
## Section Design Specification (JSON — use these exact values)
${manifestJSON}

## Instructions
1. The JSON above contains precise pixel data from the original design. Translate it faithfully.
2. Use the Semantic Analysis to pick correct HTML tags and class names.
3. Match colors, fontSize, fontWeight, padding, gap from the manifest exactly.
4. Use CSS variables from the Design System when a color matches; otherwise inline styles.
5. Preserve ALL text and image URLs verbatim.
6. Output ONLY the HTML section code block, nothing else.

Generate the HTML now:`;
}

/**
 * 解析 LLM 输出，提取 HTML
 */
export function parseLLMOutput(text: string, _sectionName: string): SectionHTMLResult {
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
  manifests: SectionManifest[],
  semanticsMap: Map<string, SectionSemantics>,
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

    const manifest = manifests[idx];
    const semantics = semanticsMap.get(section.id) ?? null;

    const result = await generateSemanticSectionHTML(
      section, dsl, nodeMap, tokens, kind, globalSystem, neighbors,
      { ...options, manifest, semantics },
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
