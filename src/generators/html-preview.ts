/**
 * DSL → HTML 生成器（v11 — 三模式: LLM语义 + Grid + 程序化像素）
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import { extractDesignTokens, generateCSSTokenBlock } from "./token-extractor.js";
import { splitSections, type Section } from "./section-splitter.js";
import {
  generateAllSemanticSections,
  type SectionHTMLResult,
} from "./llm-section-html-generator.js";
import { generateGlobalDesignSystem } from "./global-design-system.js";
import { LLMClient } from "../llm/llm-client.js";
import { analyzeDSL, type DSLAnalysis } from "./dsl-analyzer.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import { analyzeSectionsWithLLM, type SectionSemantics } from "./llm-semantic-analyzer.js";
import { buildCSSClasses, type CSSClassMap } from "./css-optimizer.js";
import { buildSectionManifest, enrichManifestsWithSemantics, type SectionManifest } from "./section-manifest.js";
import { classifySectionRisk, type GenerationMode } from "./section-risk-classifier.js";
import { renderPixelHTML } from "./programmatic-pixel-renderer.js";
import { renderGridHTML } from "./programmatic-grid-renderer.js";

export type PreviewOptions = {
  useLLM?: boolean;
  llmClient?: LLMClient;
  originalDslData?: OriginalDslData | null;
  /** 强制所有 section 用指定模式（测试用） */
  forceMode?: GenerationMode;
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

  // Step 1: 程序化分析 + 分块
  console.log("[PreviewHTML] Step 1: DSL 分析 + Section 分块...");
  const t1 = Date.now();
  const analysis = analyzeDSL(dsl);
  const sections = splitSections(dsl);
  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);
  console.log(`[PreviewHTML]   ✓ ${sections.length} sections (${Date.now() - t1}ms)`);

  // Step 2: 程序化 Section Manifest
  console.log("[PreviewHTML] Step 2: 构建 Section Manifest...");
  const t2 = Date.now();
  const manifests: SectionManifest[] = [];
  for (const section of sections) {
    const root = nodeMap.get(section.nodeId);
    if (root) {
      manifests.push(buildSectionManifest(root, nodeMap, section.name, page.width));
    } else {
      manifests.push({ sectionId: section.nodeId, sectionName: section.name, bounds: { x: 0, y: 0, width: page.width, height: 0 }, rootTag: "div", rootClassName: "", children: [] });
    }
  }
  console.log(`[PreviewHTML]   ✓ ${manifests.length} manifests (${Date.now() - t2}ms)`);

  // Step 3: LLM 语义分析 + 回填 manifest
  let semantics: Map<string, SectionSemantics> | null = null;
  if (options?.useLLM !== false) {
    console.log("[PreviewHTML] Step 3: LLM 语义分析...");
    const t3 = Date.now();
    try {
      const llm = options?.llmClient ?? new LLMClient();
      semantics = await analyzeSectionsWithLLM(sections, nodeMap, llm, page.width);

      // 回填 manifest 的 semanticType / semanticRole
      const idToIdx = new Map<string, number>();
      sections.forEach((s, i) => idToIdx.set(s.id, i));
      enrichManifestsWithSemantics(manifests, semantics, idToIdx);

      console.log(`[PreviewHTML]   ✓ 语义分析 + 回填完成 (${((Date.now() - t3) / 1000).toFixed(1)}s)`);
    } catch (err: any) {
      console.warn(`[PreviewHTML]   ⚠️ 语义分析失败: ${err.message}，跳过`);
    }
  }

  // Step 4: 分类 + 双模式生成
  console.log("[PreviewHTML] Step 4: 双模式 Section 生成...");
  const t4 = Date.now();

  const sectionModes = new Map<string, GenerationMode>();
  for (const section of sections) {
    const mode = options?.forceMode ?? classifySectionRisk(section, nodeMap).mode;
    sectionModes.set(section.id, mode);
  }
  const pixelCount = [...sectionModes.values()].filter(m => m === "pixel").length;
  const gridCount = [...sectionModes.values()].filter(m => m === "grid").length;
  const semanticCount = [...sectionModes.values()].filter(m => m === "semantic").length;
  console.log(`[PreviewHTML]   模式分布: semantic=${semanticCount}, grid=${gridCount}, pixel=${pixelCount}`);

  // LLM 只处理 semantic 模式的 section
  let semanticSections: Map<string, SectionHTMLResult> | null = null;
  const semanticSectionsList = options?.forceMode
    ? sections  // 强制模式时全部走同一路径
    : sections.filter(s => sectionModes.get(s.id) === "semantic");

  if (options?.useLLM !== false && (semanticSectionsList.length > 0 || options?.forceMode === "semantic")) {
    try {
      semanticSections = await generateAllSemanticSections(
        dsl, semanticSectionsList, manifests, semantics ?? new Map(),
        nodeMap, analysis.tokens, analysis.designSystem,
        { llmClient: options?.llmClient },
      );
    } catch (err: any) {
      console.warn(`[PreviewHTML]   ⚠️ LLM HTML 生成失败: ${err.message}`);
    }
  }
  console.log(`[PreviewHTML]   ✓ Section 生成完成 (${((Date.now() - t4) / 1000).toFixed(1)}s)`);

  // Step 5: 混合拼接
  console.log("[PreviewHTML] Step 5: 混合拼接...");
  const t5 = Date.now();
  const classMap = buildCSSClasses(nodes, nodeMap, analysis.tokens);

  const llmCoveredNodeIds = new Set<string>();
  const sectionHTMLs: string[] = [];
  let llmCount = 0;
  let gridModeCount = 0;
  let pixelModeCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const manifest = manifests[i];
    const mode = sectionModes.get(section.id) || "semantic";
    const sem = semantics?.get(section.id) ?? null;

    if (mode === "grid") {
      const html = renderGridHTML(section, manifest, sem);
      sectionHTMLs.push(html);
      gridModeCount++;
    } else if (mode === "pixel") {
      const html = renderPixelHTML(section, manifest, sem);
      sectionHTMLs.push(html);
      pixelModeCount++;
    } else {
      // LLM 语义渲染
      const semantic = semanticSections?.get(section.id);
      if (semantic?.html?.trim()) {
        sectionHTMLs.push(`<div data-dsl-id="${section.nodeId}">\n${semantic.html}\n</div>`);
        for (const nid of section.nodeIds) llmCoveredNodeIds.add(nid);
        llmCount++;
      } else {
        const sectionRoot = nodeMap.get(section.nodeId);
        if (sectionRoot) {
          const sectionMap = new Map<string, Section>();
          for (const sec of sections) {
            for (const nid of sec.nodeIds) sectionMap.set(nid, sec);
          }
          const html = renderNodeFallback(sectionRoot, nodeMap, classMap, sectionMap);
          sectionHTMLs.push(`<div data-dsl-id="${section.nodeId}">\n${html}\n</div>`);
          fallbackCount++;
        }
      }
    }
  }
  console.log(`[PreviewHTML]   ✓ Grid: ${gridModeCount}, Pixel: ${pixelModeCount}, LLM: ${llmCount}, Fallback: ${fallbackCount} (${Date.now() - t5}ms)`);

  const filteredClassCSS = filterCoveredClasses(classMap, llmCoveredNodeIds);
  const semanticCSS = semantics
    ? generateSemanticEnhancements(sections, semantics, nodeMap)
    : "";

  const fullHTML = assemblePage(dsl, analysis, {
    html: sectionHTMLs.join("\n\n"),
    css: [filteredClassCSS, semanticCSS].filter(Boolean).join("\n\n"),
  });

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`[PreviewHTML] 全部完成 — 总耗时 ${totalElapsed}s\n`);
  return fullHTML;
}

// ========== 语义感知的 CSS 增强 ==========

function generateSemanticEnhancements(
  sections: Section[],
  semantics: Map<string, SectionSemantics>,
  nodeMap: Map<string, DSLNode>,
): string {
  const cssParts: string[] = [];

  for (const section of sections) {
    const sem = semantics.get(section.id);
    if (!sem) continue;

    const root = nodeMap.get(section.nodeId);
    if (!root) continue;

    const className = sem.suggestedClassName;
    const bg = root.style?.background;
    const padding = root.style?.padding;
    const gap = root.layout?.gap;

    let css = `/* ${sem.semanticType}: ${sem.purpose} */\n`;
    css += `.${className} {\n`;
    if (bg && bg !== "transparent") css += `  background: ${bg};\n`;
    if (padding) css += `  padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;\n`;
    if (gap) css += `  gap: ${gap}px;\n`;
    css += `  width: 100%;\n`;
    css += `}\n`;

    css += `@media (max-width: 768px) {\n`;
    css += `  .${className} {\n`;
    if (padding) css += `    padding: ${Math.round(padding.top * 0.6)}px 16px;\n`;
    css += `  }\n`;
    css += `}\n`;

    cssParts.push(css);
  }

  return cssParts.join("\n");
}

// ========== 页面组装 ==========

function assemblePage(
  dsl: MachineDSL,
  analysis: DSLAnalysis,
  rendered: { html: string; css: string },
): string {
  const { page } = dsl;

  const unifiedCSS = [
    "/* === Base Reset === */",
    `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`,
    `body { font-family: var(--font-base, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); line-height: 1.5; -webkit-font-smoothing: antialiased; }`,
    `img, video { max-width: 100%; display: block; }`,
    `a { text-decoration: none; color: inherit; }`,
    `button { border: none; background: none; cursor: pointer; font-family: inherit; }`,
    "",
    "/* === Design System === */",
    analysis.designSystem.rootCSS,
    "",
    "/* === Utilities === */",
    analysis.designSystem.utilityCSS,
    "",
    "/* === Tokens === */",
    generateCSSTokenBlock(analysis.tokens),
    "",
    "/* === Section CSS === */",
    rendered.css,
    "",
    "/* === 动画 === */",
    ANIMATIONS_CSS,
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name}</title>
  ${analysis.designSystem.fontLinks || `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">`}
  <style>
${unifiedCSS}
  </style>
</head>
<body>
${rendered.html}
${INTERACTION_SCRIPT}
</body>
</html>`;
}

// ========== 全局动画 CSS ==========

const ANIMATIONS_CSS = `
/* 滚动渐入 */
[data-animate] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
[data-animate].visible {
  opacity: 1;
  transform: none;
}

/* 图片 hover */
img {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
img:hover {
  transform: scale(1.02);
}

/* 按钮 hover */
button, .btn-primary, .btn-secondary, [class*="btn-"] {
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}
button:hover, .btn-primary:hover, .btn-secondary:hover, [class*="btn-"]:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
button:active, .btn-primary:active, .btn-secondary:active, [class*="btn-"]:active {
  transform: translateY(0);
}

/* 链接 hover */
a:hover {
  opacity: 0.85;
  transition: opacity 0.2s;
}

/* 焦点 */
:focus-visible {
  outline: 2px solid var(--primary, #5747F4);
  outline-offset: 2px;
  border-radius: 4px;
}

/* 平滑滚动 */
html { scroll-behavior: smooth; }
`;

// ========== 交互脚本 ==========

const INTERACTION_SCRIPT = `
<script>
(function() {
  // 滚动动画
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.setAttribute('data-animate', 'visible');
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('section, [class*="section"], [class*="hero"], [class*="feature"]').forEach(function(el) {
      el.setAttribute('data-animate', '');
      obs.observe(el);
    });
  }

  // 图片懒加载
  document.querySelectorAll('img').forEach(function(img) {
    img.addEventListener('error', function() {
      this.style.display = 'none';
      var p = this.parentElement;
      if (p) p.style.background = '#f0f0f0';
    });
  });
})();
</script>`;

// ========== Fallback 机械渲染 ==========

function renderNodeFallback(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  sectionMap: Map<string, Section>,
): string {
  const tag = node.type === "button" ? "button" : node.type === "text" ? "p" : "div";
  const classParts = ["dsl-node", `dsl-${node.type}`];
  const extraClasses = classMap.nodeClasses.get(node.id);
  if (extraClasses) classParts.push(...extraClasses);
  const inlineStyle = classMap.nodeInlineStyles.get(node.id);
  const attrs = [
    `class="${classParts.join(" ")}"`,
    inlineStyle ? `style="${inlineStyle}"` : "",
    `data-dsl-id="${node.id}"`,
  ].filter(Boolean).join(" ");

  let content = "";

  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style?.objectFit || "cover";
    return `<div ${attrs}><img src="${escapeAttr(node.content.src)}" alt="${escapeAttr(node.name || "")}" style="display:block;width:100%;height:100%;object-fit:${objectFit};" /></div>`;
  }

  if (node.type === "text" && node.content?.text) {
    content = escapeHTML(node.content.text);
  }

  if (node.children.length > 0) {
    const childrenHTML = node.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(child => renderNodeFallback(child!, nodeMap, classMap, sectionMap))
      .join("\n");
    content += (content ? "\n" : "") + childrenHTML;
  }

  if (!content) return `<${tag} ${attrs} />`;
  return `<${tag} ${attrs}>${content}</${tag}>`;
}

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
      lines.push(`.${className} { ${body}; }`);
    }
  }
  return lines.join("\n");
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
