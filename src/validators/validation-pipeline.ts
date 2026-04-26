/**
 * Section 级截图对比 + 自动修正管线
 *
 * 流程:
 * 1. 每个 Section 生成独立 HTML
 * 2. Puppeteer 渲染截图
 * 3. 和设计稿对应区域对比
 * 4. 差异 > 阈值 → LLM 修正 → 重新对比（最多 N 次）
 */

import puppeteer, { type Browser } from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { Section } from "../generators/section-splitter.js";
import type { DesignTokens } from "../generators/token-extractor.js";
import type { CSSClassMap } from "../generators/css-optimizer.js";
import { classifySection, shouldReport, type SectionKind } from "../validators/tolerance.js";
import { CorrectionEngine, type DiffRegion } from "../validators/correction-engine.js";
import { LLMClient } from "../llm/llm-client.js";

export type SectionValidationResult = {
  sectionId: string;
  sectionName: string;
  kind: SectionKind;
  diffPercent: number;
  converged: boolean;
  attempts: number;
  corrected: boolean;
};

export type PipelineResult = {
  results: SectionValidationResult[];
  totalDiff: number;
  allConverged: boolean;
};

function renderSectionHTML(
  sectionRoot: DSLNode,
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  tokens: DesignTokens,
  pageWidth: number,
): string {
  function renderNode(node: DSLNode, indent: number): string {
    const pad = "  ".repeat(indent);
    const tag = node.type === "button" ? "button" : node.type === "text" ? "p" : "div";
    const classes = [`dsl-node`, `dsl-${node.type}`];

    const extraClasses = classMap.nodeClasses.get(node.id);
    if (extraClasses) classes.push(...extraClasses);

    const inlineStyles = classMap.nodeInlineStyles.get(node.id);
    const classAttr = `class="${classes.join(" ")}"`;
    const styleAttr = inlineStyles ? ` style="${inlineStyles}"` : "";
    const dataAttr = ` data-dsl-id="${node.id}" data-dsl-type="${node.type}"`;

    if (node.type === "image" && node.content?.src) {
      const fit = node.style.objectFit || "cover";
      const img = `<img src="${node.content.src}" style="width:100%;height:100%;object-fit:${fit}" />`;
      return `${pad}<${tag} ${classAttr}${styleAttr}${dataAttr}>\n${pad}  ${img}\n${pad}</${tag}>`;
    }

    let textContent = "";
    if (node.type === "text" && node.content?.text) {
      textContent = node.content.text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/{/g, "&#123;").replace(/}/g, "&#125;");
    }

    const children = node.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(child => renderNode(child!, indent + 1))
      .join("\n");

    if (textContent) return `${pad}<${tag} ${classAttr}${styleAttr}${dataAttr}>${textContent}</${tag}>`;
    if (!children) return `${pad}<${tag} ${classAttr}${styleAttr}${dataAttr} />`;
    return `${pad}<${tag} ${classAttr}${styleAttr}${dataAttr}>\n${children}\n${pad}</${tag}>`;
  }

  let tokenCSS = "";
  for (const group of [tokens.colors, tokens.fonts, tokens.spacings, tokens.radii, tokens.shadows]) {
    for (const [varName, value] of group.variables) {
      tokenCSS += `  ${varName}: ${value};\n`;
    }
  }

  let classCSS = "";
  for (const [cls, body] of classMap.classes) {
    classCSS += `.${cls} {\n  ${body};\n}\n\n`;
  }
  for (const [nodeId, cssStr] of classMap.nodeInlineStyles) {
    classCSS += `.node-${nodeId.slice(0, 8)} {\n  ${cssStr.replace(/;/g, ";\n  ")};\n}\n\n`;
  }

  const bodyHTML = renderNode(sectionRoot, 2);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
:root {
${tokenCSS}}
* { margin:0; padding:0; box-sizing:border-box; }
${classCSS}
</style>
</head>
<body style="width:${pageWidth}px">
${bodyHTML}
</body>
</html>`;
}

async function htmlToPNG(html: string, width: number, browser: Browser): Promise<PNG> {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const screenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  await page.close();
  return PNG.sync.read(screenshot);
}

function comparePNGs(a: PNG, b: PNG): number {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  return diffPixels / (width * height);
}

function collectNodeTypes(node: DSLNode, nodeMap: Map<string, DSLNode>): string[] {
  const types = [node.type];
  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) types.push(...collectNodeTypes(child, nodeMap));
  }
  return types;
}

export async function runValidationPipeline(
  dsl: MachineDSL,
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
  classMap: CSSClassMap,
  tokens: DesignTokens,
  options?: { maxAttempts?: number; enableLLMCorrection?: boolean },
): Promise<PipelineResult> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const enableLLM = options?.enableLLMCorrection ?? false;

  let browser: Browser;
  try {
    browser = await puppeteer.launch({ headless: true });
  } catch {
    return {
      results: sections.map(s => ({
        sectionId: s.id, sectionName: s.name,
        kind: classifySection(collectNodeTypes(nodeMap.get(s.nodeId)!, nodeMap)) as SectionKind,
        diffPercent: 0, converged: true, attempts: 0, corrected: false,
      })),
      totalDiff: 0, allConverged: true,
    };
  }

  const pageWidth = dsl.page.width || 1440;
  const results: SectionValidationResult[] = [];

  try {
    for (const section of sections) {
      const sectionRoot = nodeMap.get(section.nodeId);
      if (!sectionRoot) continue;

      const nodeTypes = collectNodeTypes(sectionRoot, nodeMap);
      const kind = classifySection(nodeTypes);

      const designHTML = renderSectionHTML(sectionRoot, nodeMap, classMap, tokens, pageWidth);
      const designPNG = await htmlToPNG(designHTML, pageWidth, browser);

      const result: SectionValidationResult = {
        sectionId: section.id,
        sectionName: section.name,
        kind,
        diffPercent: 0,
        converged: true,
        attempts: 0,
        corrected: false,
      };

      let currentDesignPNG = designPNG;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        result.attempts = attempt;

        const generatedHTML = renderSectionHTML(sectionRoot, nodeMap, classMap, tokens, pageWidth);
        const generatedPNG = await htmlToPNG(generatedHTML, pageWidth, browser);

        const diffPercent = comparePNGs(currentDesignPNG, generatedPNG);
        result.diffPercent = diffPercent;

        if (!shouldReport(diffPercent, kind)) {
          result.converged = true;
          break;
        }

        if (enableLLM && attempt < maxAttempts) {
          const diff: DiffRegion = {
            sectionId: section.id,
            diffPercent,
            nodeTypes,
          };

          const sectionCode = renderSectionHTML(sectionRoot, nodeMap, classMap, tokens, pageWidth);
          const llm = new LLMClient();
          const engine = new CorrectionEngine(llm, 1);
          await engine.correctSection(sectionCode, diff);
          result.corrected = true;
        }

        if (attempt === maxAttempts) {
          result.converged = false;
        }
      }

      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const totalDiff = results.length > 0
    ? results.reduce((sum, r) => sum + r.diffPercent, 0) / results.length
    : 0;

  return {
    results,
    totalDiff,
    allConverged: results.every(r => r.converged),
  };
}
