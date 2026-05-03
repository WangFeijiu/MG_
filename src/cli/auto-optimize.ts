/**
 * 自动优化 CLI
 *
 * 用法:
 *   npm run auto-optimize
 *
 * 功能:
 * 1. 读取现有的 DSL 和设计稿
 * 2. 自动迭代优化，直到达到像素级还原
 * 3. 保存优化后的 DSL
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AutoOptimizer } from "../optimizers/auto-optimizer.js";
import { splitSections } from "../generators/section-splitter.js";
import { extractOriginalDslData } from "../converters/original-dsl-extractor.js";
import type { MachineDSL } from "../types/machine-dsl.js";

async function main() {
  console.log("🚀 自动优化引擎启动\n");

  const outputDir = "output";

  // 检查必要文件
  const machineDSLPath = join(outputDir, "machine-dsl.json");
  const originalDSLPath = join(outputDir, "original-dsl.json");
  const baselinePath = join(outputDir, "design-baseline.png");

  if (!existsSync(machineDSLPath)) {
    console.error("❌ machine-dsl.json 不存在，请先运行 npm run dev");
    process.exit(1);
  }

  if (!existsSync(baselinePath)) {
    console.error("❌ design-baseline.png 不存在，请先放置设计稿到 output 目录");
    process.exit(1);
  }

  // 读取 DSL
  console.log("📖 读取 DSL 文件...");
  const machineDSL: MachineDSL = JSON.parse(readFileSync(machineDSLPath, "utf-8"));

  let originalData = null;
  if (existsSync(originalDSLPath)) {
    const originalDSL = JSON.parse(readFileSync(originalDSLPath, "utf-8"));
    originalData = extractOriginalDslData(originalDSL);
    console.log("✓ 已加载原始 DSL 数据");
  }

  // 分割 Sections
  const sections = splitSections(machineDSL);
  console.log(`✓ 已分割 ${sections.length} 个 Section\n`);

  // 创建优化器
  const optimizer = new AutoOptimizer({
    maxIterations: 10,
    targetDiffThreshold: 0.02,
    outputDir,
  });

  try {
    // 运行优化
    const results = await optimizer.optimize(machineDSL, sections, originalData);

    // 输出结果
    console.log("\n" + "=".repeat(60));
    console.log("优化结果汇总");
    console.log("=".repeat(60));

    let totalConverged = 0;
    let totalIterations = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const status = result.converged ? "✓" : "✗";
      console.log(`\n[Section ${i + 1}] ${sections[i].name}`);
      console.log(`  状态: ${status} ${result.converged ? "已收敛" : "未收敛"}`);
      console.log(`  迭代次数: ${result.iteration}`);
      console.log(`  最终差异: ${(result.diffPercent * 100).toFixed(2)}%`);
      console.log(`  应用修复: ${result.appliedFixes.length} 个`);

      if (result.appliedFixes.length > 0) {
        console.log(`  修复列表:`);
        for (const fix of result.appliedFixes) {
          console.log(`    - ${fix}`);
        }
      }

      if (result.converged) totalConverged++;
      totalIterations += result.iteration;
    }

    console.log("\n" + "=".repeat(60));
    console.log(`总计: ${totalConverged}/${results.length} 个 Section 已收敛`);
    console.log(`平均迭代次数: ${(totalIterations / results.length).toFixed(1)}`);
    console.log("=".repeat(60) + "\n");

    // 保存优化后的 DSL
    const optimizedPath = join(outputDir, "optimized-machine-dsl.json");
    writeFileSync(optimizedPath, JSON.stringify(machineDSL, null, 2), "utf-8");
    console.log(`✓ 优化后的 DSL 已保存: ${optimizedPath}\n`);

    console.log("🎉 自动优化完成！");
    console.log("   下一步: 运行 npm run dev -- --rebuild 重新生成 HTML\n");
  } finally {
    await optimizer.cleanup();
  }
}

main().catch(error => {
  console.error("❌ 错误:", error);
  process.exit(1);
});
