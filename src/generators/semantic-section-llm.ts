/**
 * 语义化 Section LLM 包装器
 *
 * 可选的快速增强：LLM 只负责
 * 1. 选择语义 HTML5 标签
 * 2. 添加有意义的 class 名
 * 3. 添加响应式 @media 查询
 * 4. 添加交互模式（手风琴、动画等）
 *
 * 关键：prompt < 8KB
 */

import type { Section } from "./section-splitter.js";
import type { SectionRenderResult } from "./programmatic-section-renderer.js";
import type { GlobalDesignSystem } from "./global-design-system.js";
import { LLMClient } from "../llm/llm-client.js";

const SEMANTIC_SYSTEM_PROMPT = `You wrap mechanical HTML into semantic HTML5.
Rules:
1. Pick the best root tag: nav, header, section, article, aside, footer, main
2. Replace generic class names with semantic ones: .navbar, .hero, .feature-card, .cta-section, .testimonial, .footer-col
3. Keep ALL existing CSS classes, inline styles, data-dsl-id attributes, and content EXACTLY as-is
4. Add responsive @media rules only if needed for mobile (max-width:768px)
5. Output ONLY the wrapped HTML, no explanation
6. Keep the output under 4KB`;

/**
 * 用 LLM 语义化包装已程序化渲染的 section HTML
 * prompt 保持 < 8KB
 */
export async function semanticWrapSection(
  section: Section,
  rendered: SectionRenderResult,
  globalSystem: GlobalDesignSystem,
  options?: { llmClient?: LLMClient },
): Promise<SectionRenderResult> {
  const llm = options?.llmClient ?? new LLMClient({ maxTokens: 8192 });

  // 构建 compact prompt（< 8KB）
  const cssVars = extractCompactVars(globalSystem);
  const prompt = buildSemanticPrompt(section, rendered, cssVars);

  try {
    const response = await llm.chatWithRetry(
      [{ role: "user", content: prompt }],
      SEMANTIC_SYSTEM_PROMPT,
      2,
    );

    const wrappedHTML = parseSemanticOutput(response.text, rendered.html);
    return { html: wrappedHTML, css: rendered.css };
  } catch {
    // LLM 失败 → 返回原始程序化渲染结果
    return rendered;
  }
}

/**
 * 批量语义化包装（顺序执行，控制速率）
 */
export async function semanticWrapAllSections(
  sections: Section[],
  rendered: Map<string, SectionRenderResult>,
  globalSystem: GlobalDesignSystem,
  options?: { llmClient?: LLMClient },
): Promise<Map<string, SectionRenderResult>> {
  const results = new Map<string, SectionRenderResult>();

  for (const section of sections) {
    const renderedSection = rendered.get(section.id);
    if (!renderedSection) continue;

    const wrapped = await semanticWrapSection(section, renderedSection, globalSystem, options);
    results.set(section.id, wrapped);
  }

  return results;
}

function extractCompactVars(system: GlobalDesignSystem): string {
  // 只提取关键变量，保持 prompt 小
  const vars = system.variables;
  const keys = [
    "--text-primary", "--text-secondary", "--surface", "--primary",
    "--border", "--content-width", "--font-base",
  ];
  const lines: string[] = [];
  for (const k of keys) {
    const v = vars.get(k);
    if (v) lines.push(`  ${k}: ${v};`);
  }
  return lines.join("\n");
}

function buildSemanticPrompt(
  section: Section,
  rendered: SectionRenderResult,
  cssVars: string,
): string {
  // 截断 HTML 以控制 prompt 大小
  const maxHTML = 4000;
  let html = rendered.html;
  if (html.length > maxHTML) {
    html = html.slice(0, maxHTML) + "\n<!-- ... truncated ... -->";
  }

  return `## Key CSS Variables
:root { ${cssVars} }

## Section: "${section.name}" (${section.nodeIds.length} nodes)
${html}

Wrap the above mechanical HTML in semantic HTML5 tags with meaningful class names. Preserve ALL data-dsl-id, styles, and content.`;
}

function parseSemanticOutput(llmText: string, fallback: string): string {
  let html = llmText.trim();
  html = html.replace(/^```html\s*\n?/i, "");
  html = html.replace(/^```\s*\n?/, "");
  html = html.replace(/\n?```\s*$/, "");

  // 基本验证：必须包含 data-dsl-id 才是有效输出
  if (!html.includes("data-dsl-id")) {
    return fallback;
  }

  return html;
}
