/**
 * 完整的调试脚本：生成截图并分析差异
 */

import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type { MachineDSL } from "./types/machine-dsl.js";
import { splitSections } from "./generators/section-splitter.js";
import { analyzeDSL } from "./generators/dsl-analyzer.js";
import { renderPageProgrammatic } from "./generators/programmatic-section-renderer.legacy.js";
import { extractOriginalDslData } from "./converters/original-dsl-extractor.js";

async function debug() {
  console.log("🔍 开始调试分析\n");

  // 读取DSL
  const machineDSL: MachineDSL = JSON.parse(readFileSync("output/machine-dsl.json", "utf-8"));
  const originalDSL = JSON.parse(readFileSync("output/original-dsl.json", "utf-8"));
  const originalData = extractOriginalDslData(originalDSL);

  // 读取设计稿
  const baselineFull = PNG.sync.read(readFileSync("output/design-baseline.png"));
  console.log(`✓ 设计稿尺寸: ${baselineFull.width}x${baselineFull.height}\n`);

  // 分割sections
  const sections = splitSections(machineDSL);
  console.log(`✓ 已分割 ${sections.length} 个 Section\n`);

  // 生成完整页面HTML
  const analysis = analyzeDSL(machineDSL);
  const rendered = renderPageProgrammatic(machineDSL, sections, originalData, analysis);
  const fullHTML = assembleHTML(machineDSL, rendered.html, rendered.css, analysis);
  writeFileSync("output/debug-full-page.html", fullHTML);
  console.log("✓ 已生成完整页面HTML: output/debug-full-page.html\n");

  // 截图完整页面
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: machineDSL.page.width || 1440, height: 800 });
  await page.setContent(fullHTML, { waitUntil: "networkidle0" });
  const fullScreenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  writeFileSync("output/debug-full-screenshot.png", fullScreenshot);
  console.log("✓ 已截图完整页面: output/debug-full-screenshot.png\n");

  const fullPNG = PNG.sync.read(fullScreenshot);
  console.log(`✓ 生成页面尺寸: ${fullPNG.width}x${fullPNG.height}\n`);

  // 对比每个Section
  console.log("=" .repeat(60));
  console.log("Section 差异分析");
  console.log("=".repeat(60) + "\n");

  const nodeMap = new Map();
  for (const node of machineDSL.nodes) nodeMap.set(node.id, node);

  for (let i = 0; i < Math.min(sections.length, 5); i++) {
    const section = sections[i];
    const sectionRoot = nodeMap.get(section.nodeId);
    if (!sectionRoot) continue;

    const sectionY = sectionRoot.layout.y ?? 0;
    const sectionHeight = typeof sectionRoot.layout.height === "number" ? sectionRoot.layout.height : 400;

    console.log(`[Section ${i + 1}] ${section.name}`);
    console.log(`  位置: y=${sectionY}, height=${sectionHeight}`);

    // 裁剪baseline
    const baselineCrop = cropPNG(baselineFull, 0, sectionY, baselineFull.width, sectionHeight);

    // 裁剪screenshot
    const screenshotCrop = cropPNG(fullPNG, 0, sectionY, fullPNG.width, sectionHeight);

    // 保存裁剪后的图片
    writeFileSync(`output/debug-section-${i + 1}-baseline.png`, PNG.sync.write(baselineCrop));
    writeFileSync(`output/debug-section-${i + 1}-screenshot.png`, PNG.sync.write(screenshotCrop));

    // 对比
    const width = Math.min(baselineCrop.width, screenshotCrop.width);
    const height = Math.min(baselineCrop.height, screenshotCrop.height);

    const paddedBaseline = padPNG(baselineCrop, width, height);
    const paddedScreenshot = padPNG(screenshotCrop, width, height);

    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(
      paddedBaseline.data,
      paddedScreenshot.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 }
    );

    const diffPercent = (diffPixels / (width * height)) * 100;

    writeFileSync(`output/debug-section-${i + 1}-diff.png`, PNG.sync.write(diff));

    console.log(`  差异: ${diffPercent.toFixed(2)}%`);
    console.log(`  文件: debug-section-${i + 1}-*.png\n`);
  }

  await browser.close();

  console.log("=" .repeat(60));
  console.log("✅ 调试完成！请查看 output/debug-*.png 文件");
  console.log("=".repeat(60));
}

function assembleHTML(dsl: MachineDSL, bodyHTML: string, css: string, analysis: any): string {
  const pageWidth = dsl.page.width || 1440;
  const rootCSS = analysis.designSystem?.rootCSS || '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dsl.page.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    ${rootCSS}
    ${css}
  </style>
</head>
<body style="width: ${pageWidth}px; margin: 0 auto;">
  ${bodyHTML}
</body>
</html>`;
}

function cropPNG(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const cx = Math.max(0, Math.round(x));
  const cy = Math.max(0, Math.round(y));
  const cw = Math.min(Math.round(w), src.width - cx);
  const ch = Math.min(Math.round(h), src.height - cy);

  if (cw <= 0 || ch <= 0) return new PNG({ width: 1, height: 1 });

  const out = new PNG({ width: cw, height: ch });
  for (let row = 0; row < ch; row++) {
    const srcOffset = ((cy + row) * src.width + cx) << 2;
    src.data.copy(out.data, row * cw * 4, srcOffset, srcOffset + cw * 4);
  }
  return out;
}

function padPNG(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;

  const out = new PNG({ width, height });
  for (let y = 0; y < Math.min(src.height, height); y++) {
    for (let x = 0; x < Math.min(src.width, width); x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstIdx = (width * y + x) << 2;
      out.data[dstIdx] = src.data[srcIdx];
      out.data[dstIdx + 1] = src.data[srcIdx + 1];
      out.data[dstIdx + 2] = src.data[srcIdx + 2];
      out.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return out;
}

debug().catch(console.error);
