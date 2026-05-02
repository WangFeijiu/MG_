/**
 * 独立的 React 代码生成命令
 * 从已校准的 HTML/DSL 生成 React 组件代码
 *
 * 用法:
 *   npm run generate-react
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

config();

import { generateReactApp } from "./generators/react-section-generator.js";
import { applyPatches } from "./utils/patch.js";
import type { PatchDocument } from "./types/patch.js";

const outputDir = "output";

async function main() {
  console.log("⚛️  React 代码生成\n");

  const machineDSLPath = join(outputDir, "machine-dsl.json");
  if (!existsSync(machineDSLPath)) {
    console.error("❌ machine-dsl.json 不存在，请先运行 npm run dev");
    process.exit(1);
  }

  let dsl = JSON.parse(readFileSync(machineDSLPath, "utf-8"));

  // 应用 patches（如果存在）
  const patchPath = join(outputDir, "patches.json");
  if (existsSync(patchPath)) {
    const patchDoc: PatchDocument = JSON.parse(readFileSync(patchPath, "utf-8"));
    if (patchDoc.patches?.length > 0) {
      console.log(`   应用 ${patchDoc.patches.length} 个 patch...`);
      dsl = applyPatches(dsl, patchDoc);
    }
  }

  // 生成 React 代码
  console.log("   生成 React 组件...");
  const reactOutput = await generateReactApp(dsl);
  const reactDir = join(outputDir, "react");
  const sectionsDir = join(reactDir, "sections");
  if (!existsSync(reactDir)) mkdirSync(reactDir, { recursive: true });
  if (!existsSync(sectionsDir)) mkdirSync(sectionsDir, { recursive: true });

  writeFileSync(join(reactDir, "App.tsx"), reactOutput.appTSX, "utf-8");
  writeFileSync(join(reactDir, "App.css"), reactOutput.appCSS, "utf-8");
  for (const section of reactOutput.sections) {
    writeFileSync(join(sectionsDir, section.fileName), section.code, "utf-8");
  }

  console.log(`\n✅ React 代码已保存: ${reactDir}/`);
  console.log(`   App.tsx + App.css + ${reactOutput.sections.length} sections`);
}

main().catch(error => {
  console.error("❌ 错误:", error);
  process.exit(1);
});
