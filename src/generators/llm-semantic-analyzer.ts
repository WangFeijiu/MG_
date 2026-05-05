/**
 * LLM 语义分析器
 *
 * 用 LLM 分析每个 Section 的语义和结构，
 * 替代 structure-based-classifier.ts 中硬编码的 if-else 规则。
 *
 * 分析结果用于：
 * 1. 理解 Section 的语义角色（导航、英雄区、特性展示……）
 * 2. 识别关键元素（标题、按钮、图片……）及其 role
 * 3. 决定布局策略（flex 方向、grid 列数……）
 * 4. 建议响应式和动画策略
 */

import type { DSLNode } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";
import { LLMClient } from "../llm/llm-client.js";
import { buildSectionManifest } from "./section-manifest.js";

// ========== 类型 ==========

export type ElementRole = {
  /** 节点在 section 中的语义角色，如 title / subtitle / cta-button / product-image */
  role: string;
  /** 对应的 DSL 节点 ID，方便后续精确提取样式 */
  nodeId: string;
  /** 节点类型 */
  nodeType: string;
  /** 节点文本内容摘要（如有） */
  textPreview?: string;
};

export type SectionSemantics = {
  sectionId: string;
  /** LLM 识别的语义类型，如 navbar / hero / features-grid / testimonials … */
  semanticType: string;
  /** 一句话描述这个 section 的目的 */
  purpose: string;
  /** 关键元素及其 role */
  keyElements: ElementRole[];
  /** 建议的 HTML 根标签，如 nav / section / header / footer */
  suggestedRootTag: string;
  /** 建议的主 CSS class 名 */
  suggestedClassName: string;
};

// ========== 缓存 ==========

const cache = new Map<string, SectionSemantics>();

// ========== 主入口 ==========

export async function analyzeSectionsWithLLM(
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
  llm?: LLMClient,
  pageWidth?: number,
): Promise<Map<string, SectionSemantics>> {
  const client = llm ?? new LLMClient();
  const results = new Map<string, SectionSemantics>();
  const width = pageWidth ?? 1440;

  console.log(`\n[LLM语义分析] 开始分析 ${sections.length} 个 Section...`);

  // 并发 3 路
  const CONCURRENCY = 3;
  const queue = [...sections];

  async function worker() {
    while (queue.length > 0) {
      const section = queue.shift()!;
      const cacheKey = buildCacheKey(section, nodeMap);

      if (cache.has(cacheKey)) {
        results.set(section.id, cache.get(cacheKey)!);
        continue;
      }

      console.log(`  [分析] "${section.name}" (${section.nodeIds.length} nodes)...`);
      const startMs = Date.now();

      try {
        const sem = await analyzeOne(section, nodeMap, client, width);
        cache.set(cacheKey, sem);
        results.set(section.id, sem);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`    ✓ "${section.name}" → ${sem.semanticType} (${elapsed}s)`);
      } catch (err: any) {
        console.warn(`    ✗ "${section.name}" 分析失败: ${err.message}`);
        results.set(section.id, fallbackSemantics(section, nodeMap));
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, sections.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  console.log(`[LLM语义分析] 完成\n`);
  return results;
}

// ========== 单 Section 分析 ==========

async function analyzeOne(
  section: Section,
  nodeMap: Map<string, DSLNode>,
  llm: LLMClient,
  pageWidth: number,
): Promise<SectionSemantics> {
  const root = nodeMap.get(section.nodeId);
  if (!root) return fallbackSemantics(section, nodeMap);

  const manifest = buildSectionManifest(root, nodeMap, section.name, pageWidth);

  const texts: string[] = [];
  collectTexts(root, nodeMap, texts);

  const prompt = `Analyze the following UI section and identify its semantic role, key elements, and their purposes.

## Section: "${section.name}"

### Design Specification (JSON with precise pixel data)
${JSON.stringify(manifest, null, 2)}

### Text Content Samples
${texts.slice(0, 8).map((t, i) => `${i + 1}. "${t}"`).join("\n")}

### Task
Identify:
1. What is this section's semantic type? (e.g. navbar, hero-banner, feature-grid, product-showcase, testimonials, faq, cta-banner, contact-form, footer, content-block, etc.)
2. What is its purpose in one sentence?
3. What are the key elements and their roles? For each element, give its DSL node ID, type, and semantic role (like title, subtitle, cta-button, product-image, icon, etc.)
4. What semantic HTML tag should be the root? (nav, section, header, footer, aside, article, main)
5. What would be a good kebab-case CSS class name for this section?

### Output Format (JSON only, no markdown)
{
  "semanticType": "...",
  "purpose": "...",
  "keyElements": [
    {"nodeId": "...", "nodeType": "...", "role": "...", "textPreview": "..."}
  ],
  "suggestedRootTag": "...",
  "suggestedClassName": "..."
}`;

  const resp = await llm.chatWithRetry(
    [{ role: "user", content: prompt }],
    "You are an expert UI/UX analyst. You analyze design structures and identify semantic roles. Always respond with valid JSON only.",
    2,
  );

  return parseResponse(resp.text, section.id);
}

// ========== 解析 LLM 响应 ==========

function parseResponse(text: string, sectionId: string): SectionSemantics {
  let raw = text.trim();

  // 去掉可能的 markdown 代码块包裹
  raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");

  // 找到第一个 { 和最后一个 }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("无法从 LLM 响应中提取 JSON");
  }

  const json = raw.slice(start, end + 1);
  const parsed = JSON.parse(json);

  return {
    sectionId,
    semanticType: parsed.semanticType || "content-block",
    purpose: parsed.purpose || "",
    keyElements: (parsed.keyElements || []).map((el: any) => ({
      role: el.role || "unknown",
      nodeId: el.nodeId || "",
      nodeType: el.nodeType || "unknown",
      textPreview: el.textPreview,
    })),
    suggestedRootTag: parsed.suggestedRootTag || "section",
    suggestedClassName: parsed.suggestedClassName || "content-section",
  };
}

// ========== Fallback ==========

function fallbackSemantics(section: Section, nodeMap: Map<string, DSLNode>): SectionSemantics {
  const root = nodeMap.get(section.nodeId);
  const allNodes = section.nodeIds.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];

  const texts: string[] = [];
  collectTexts(root!, nodeMap, texts);

  return {
    sectionId: section.id,
    semanticType: "content-block",
    purpose: "展示内容",
    keyElements: allNodes
      .filter(n => n.type === "text" && n.content?.text)
      .slice(0, 5)
      .map(n => ({
        role: "text",
        nodeId: n.id,
        nodeType: n.type,
        textPreview: n.content!.text!.slice(0, 30),
      })),
    suggestedRootTag: "section",
    suggestedClassName: "content-section",
  };
}

// ========== 工具函数 ==========

function buildCacheKey(section: Section, nodeMap: Map<string, DSLNode>): string {
  const texts: string[] = [];
  const root = nodeMap.get(section.nodeId);
  if (root) collectTexts(root, nodeMap, texts);
  const data = `${section.id}:${section.nodeIds.length}:${texts.join("|")}`;
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h + data.charCodeAt(i)) | 0;
  }
  return String(h);
}

function collectTexts(node: DSLNode, nodeMap: Map<string, DSLNode>, out: string[]) {
  if (node.type === "text" && node.content?.text) {
    out.push(node.content.text);
  }
  for (const cid of node.children) {
    const child = nodeMap.get(cid);
    if (child) collectTexts(child, nodeMap, out);
  }
}
