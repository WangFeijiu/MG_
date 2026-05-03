/**
 * 测试脚本：验证DSL属性修改是否影响HTML输出
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import type { MachineDSL } from "./types/machine-dsl.js";
import { splitSections } from "./generators/section-splitter.js";
import { analyzeDSL } from "./generators/dsl-analyzer.js";
import { renderPageProgrammatic } from "./generators/programmatic-section-renderer.legacy.js";
import { extractOriginalDslData } from "./converters/original-dsl-extractor.js";

async function test() {
  console.log("🧪 开始测试 DSL 属性修改\n");

  // 读取DSL
  const machineDSL: MachineDSL = JSON.parse(readFileSync("output/machine-dsl.json", "utf-8"));
  const originalDSL = JSON.parse(readFileSync("output/original-dsl.json", "utf-8"));
  const originalData = extractOriginalDslData(originalDSL);

  // 分割sections
  const sections = splitSections(machineDSL);
  console.log(`✓ 已分割 ${sections.length} 个 Section\n`);

  // 选择第一个Section进行测试
  const testSection = sections[2]; // Section 3
  console.log(`📍 测试 Section: ${testSection.name}\n`);

  // 找到Section根节点
  const sectionRoot = machineDSL.nodes.find(n => n.id === testSection.nodeId);
  if (!sectionRoot) {
    console.error("❌ 找不到Section根节点");
    return;
  }

  console.log("原始属性:");
  console.log(`  background: ${sectionRoot.style.background}`);
  console.log(`  layout.mode: ${sectionRoot.layout.mode}`);
  console.log(`  layout.direction: ${sectionRoot.layout.direction}`);
  console.log(`  layout.gap: ${sectionRoot.layout.gap}\n`);

  // 生成原始HTML
  const analysis1 = analyzeDSL(machineDSL);
  const rendered1 = renderPageProgrammatic(machineDSL, [testSection], originalData, analysis1);
  const html1 = assembleHTML(machineDSL, rendered1.html, rendered1.css);
  writeFileSync("output/test-original.html", html1);
  console.log("✓ 已生成原始HTML: output/test-original.html");

  // 修改DSL属性
  const modifiedDSL = JSON.parse(JSON.stringify(machineDSL));
  const modifiedRoot = modifiedDSL.nodes.find((n: any) => n.id === testSection.nodeId);

  // 测试1: 修改背景颜色
  modifiedRoot.style.background = "#ff0000"; // 改成红色

  // 测试2: 修改布局方向
  modifiedRoot.layout.mode = "flex";
  modifiedRoot.layout.direction = "column";

  // 测试3: 修改gap
  modifiedRoot.layout.gap = 50;

  console.log("\n修改后属性:");
  console.log(`  background: ${modifiedRoot.style.background}`);
  console.log(`  layout.mode: ${modifiedRoot.layout.mode}`);
  console.log(`  layout.direction: ${modifiedRoot.layout.direction}`);
  console.log(`  layout.gap: ${modifiedRoot.layout.gap}\n`);

  // 生成修改后的HTML
  const analysis2 = analyzeDSL(modifiedDSL);
  const rendered2 = renderPageProgrammatic(modifiedDSL, [testSection], originalData, analysis2);
  const html2 = assembleHTML(modifiedDSL, rendered2.html, rendered2.css);
  writeFileSync("output/test-modified.html", html2);
  console.log("✓ 已生成修改后HTML: output/test-modified.html");

  // 截图对比
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: 1440, height: 800 });
  await page.setContent(html1, { waitUntil: "networkidle0" });
  const screenshot1 = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  writeFileSync("output/test-original.png", screenshot1);
  console.log("✓ 已截图原始版本: output/test-original.png");

  await page.setContent(html2, { waitUntil: "networkidle0" });
  const screenshot2 = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  writeFileSync("output/test-modified.png", screenshot2);
  console.log("✓ 已截图修改版本: output/test-modified.png");

  await browser.close();

  // 对比差异
  const png1 = PNG.sync.read(screenshot1);
  const png2 = PNG.sync.read(screenshot2);

  let diffPixels = 0;
  for (let i = 0; i < png1.data.length; i += 4) {
    const r1 = png1.data[i];
    const g1 = png1.data[i + 1];
    const b1 = png1.data[i + 2];
    const r2 = png2.data[i];
    const g2 = png2.data[i + 1];
    const b2 = png2.data[i + 2];

    const colorDist = Math.sqrt(
      Math.pow(r1 - r2, 2) +
      Math.pow(g1 - g2, 2) +
      Math.pow(b1 - b2, 2)
    );

    if (colorDist > 30) {
      diffPixels++;
    }
  }

  const totalPixels = png1.width * png1.height;
  const diffPercent = (diffPixels / totalPixels) * 100;

  console.log(`\n📊 差异分析:`);
  console.log(`  总像素: ${totalPixels}`);
  console.log(`  差异像素: ${diffPixels}`);
  console.log(`  差异百分比: ${diffPercent.toFixed(2)}%`);

  if (diffPercent > 1) {
    console.log("\n✅ 修改生效！DSL属性变化确实影响了HTML输出");
  } else {
    console.log("\n❌ 修改未生效！DSL属性变化没有影响HTML输出");
  }
}

function assembleHTML(dsl: MachineDSL, bodyHTML: string, css: string): string {
  const pageWidth = dsl.page.width || 1440;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dsl.page.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    ${css}
  </style>
</head>
<body style="width: ${pageWidth}px; margin: 0 auto;">
  ${bodyHTML}
</body>
</html>`;
}

test().catch(console.error);
