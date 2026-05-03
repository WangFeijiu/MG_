/**
 * 增强版主流程 - 集成自动优化
 *
 * 用法:
 *   npm run dev:auto           # 完整流程 + 自动优化
 *   npm run dev:auto -- --rebuild  # 仅重建 + 自动优化
 *
 * 流程:
 * 1. 获取/读取 DSL
 * 2. 生成初始 HTML
 * 3. 自动优化迭代
 * 4. 保存最终结果
 */

import { config } from "dotenv";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

config();

import { convertMasterGoToMachine } from "./converters/mastergo-to-machine.js";
import { generatePreviewHTML } from "./generators/html-preview.js";
import { splitSections } from "./generators/section-splitter.js";
import { extractOriginalDslData } from "./converters/original-dsl-extractor.js";
import { AutoOptimizer } from "./optimizers/auto-optimizer.js";
import type { MachineDSL } from "./types/machine-dsl.js";

const args = process.argv.slice(2);
const isRebuildOnly = args.includes("--rebuild");

async function main() {
  console.log("🚀 MasterGo DSL 工具链启动（自动优化模式）\n");

  const outputDir = "output";
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  let machineDSL: MachineDSL;
  let originalData: any = null;

  if (isRebuildOnly) {
    // 重建模式
    console.log("🔄 重建模式：从本地文件读取\n");

    const machineDSLPath = join(outputDir, "machine-dsl.json");
    if (!existsSync(machineDSLPath)) {
      console.error("❌ machine-dsl.json 不存在，请先运行 npm run dev");
      process.exit(1);
    }

    machineDSL = JSON.parse(readFileSync(machineDSLPath, "utf-8"));

    const originalDSLPath = join(outputDir, "original-dsl.json");
    if (existsSync(originalDSLPath)) {
      const originalDSL = JSON.parse(readFileSync(originalDSLPath, "utf-8"));
      originalData = extractOriginalDslData(originalDSL);
    }
  } else {
    // 完整流程
    console.log("📥 Step 1: 从 MasterGo 获取 DSL...");
    // 这里需要实现 MasterGo 获取逻辑，暂时跳过
    console.log("⚠️  完整流程暂未实现，请使用 --rebuild 模式\n");
    process.exit(1);
  }

  // 生成初始 HTML
  console.log("🎨 Step 2: 生成初始 HTML...");
  const initialHTML = await generatePreviewHTML(machineDSL, { originalDslData: originalData });
  const previewPath = join(outputDir, "preview.html");
  writeFileSync(previewPath, initialHTML, "utf-8");
  console.log(`✓ 初始 HTML 已保存: ${previewPath}\n`);

  // 检查是否有设计稿
  const baselinePath = join(outputDir, "design-baseline.png");
  if (!existsSync(baselinePath)) {
    console.log("⚠️  未找到设计稿 baseline，跳过自动优化");
    console.log("   请将设计稿截图命名为 design-baseline.png 并放到 output 目录\n");
    console.log("🎉 完成！");
    return;
  }

  // 自动优化
  console.log("🔧 Step 3: 启动自动优化...");
  const sections = splitSections(machineDSL);
  const optimizer = new AutoOptimizer({
    maxIterations: 10,
    targetDiffThreshold: 0.02,
    outputDir,
  });

  try {
    const results = await optimizer.optimize(machineDSL, sections, originalData);

    // 统计结果
    const convergedCount = results.filter(r => r.converged).length;
    const avgDiff = results.reduce((sum, r) => sum + r.diffPercent, 0) / results.length;

    console.log(`\n✓ 自动优化完成`);
    console.log(`  收敛: ${convergedCount}/${results.length} 个 Section`);
    console.log(`  平均差异: ${(avgDiff * 100).toFixed(2)}%\n`);

    // 重新生成优化后的 HTML
    console.log("🎨 Step 4: 生成优化后的 HTML...");
    const optimizedHTML = await generatePreviewHTML(machineDSL, { originalDslData: originalData });
    const optimizedPath = join(outputDir, "preview-optimized.html");
    writeFileSync(optimizedPath, optimizedHTML, "utf-8");
    writeFileSync(previewPath, optimizedHTML, "utf-8");
    console.log(`✓ 优化后的 HTML 已保存: ${optimizedPath}\n`);

    // 保存优化后的 DSL
    const optimizedDSLPath = join(outputDir, "optimized-machine-dsl.json");
    writeFileSync(optimizedDSLPath, JSON.stringify(machineDSL, null, 2), "utf-8");
    console.log(`✓ 优化后的 DSL 已保存: ${optimizedDSLPath}\n`);

    console.log("🎉 全部完成！");
    console.log("   请在浏览器中查看 preview.html 对比效果\n");
  } finally {
    await optimizer.cleanup();
  }
}

main().catch(error => {
  console.error("❌ 错误:", error);
  process.exit(1);
});
