/**
 * MasterGo DSL 工具链主入口
 * 完整流程：MasterGo DSL → 机器 DSL → 预览 HTML → Patch → 最终代码
 *
 * 用法:
 *   npm run dev           # 完整流程（从 MasterGo 获取 DSL）
 *   npm run dev -- --rebuild  # 仅从本地文件重建 HTML（不重新获取 DSL）
 */

import { config } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";

// 加载环境变量
config();

import { convertMasterGoToMachine } from "./converters/mastergo-to-machine.js";
import { generatePreviewHTML } from "./generators/html-preview.js";
import { applyPatches } from "./utils/patch.js";
import { splitSections } from "./generators/section-splitter.js";
import { extractOriginalDslData } from "./converters/original-dsl-extractor.js";
import { runValidationPipeline } from "./validators/validation-pipeline.js";

import type { PatchDocument } from "./types/patch.js";

const args = process.argv.slice(2);
const isRebuildOnly = args.includes("--rebuild");

// ============ .env 变更检测 ============

/**
 * 读取 .env 文件（不使用 dotenv，避免污染）
 */
function readEnvFile(): Record<string, string> {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return result;
}

/**
 * 保存 .env 快照到 output/.env.snapshot
 */
function saveEnvSnapshot(env: Record<string, string>, outputDir: string) {
  const snapshot = {
    MG_MCP_TOKEN: env["MG_MCP_TOKEN"] || "",
    MG_FILE_ID: env["MG_FILE_ID"] || "",
    MG_LAYER_ID: env["MG_LAYER_ID"] || "",
    snapshotAt: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, ".env.snapshot"), JSON.stringify(snapshot, null, 2), "utf-8");
}

/**
 * 读取 .env 快照文件
 */
function readEnvSnapshot(outputDir: string): Record<string, string> | null {
  const snapshotPath = join(outputDir, ".env.snapshot");
  if (!existsSync(snapshotPath)) return null;
  try {
    return JSON.parse(readFileSync(snapshotPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * 清空 output 目录（保留文件夹本身）
 */
function clearOutputDir(outputDir: string) {
  if (!existsSync(outputDir)) return;
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    const path = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      // 递归删除子目录的所有内容，保留 output/ 下的一级子目录本身
      removeDirContents(path, true);
    } else {
      unlinkSync(path);
    }
  }
  console.log("🗑️  output 目录内容已清空（目录结构保留）\n");
}

function removeDirContents(dir: string, preserveDir: boolean = false) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDirContents(path, false);
      if (!preserveDir) rmSync(path, { recursive: true, force: true });
    } else {
      unlinkSync(path);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log("🚀 MasterGo DSL 工具链启动\n");

  // 创建输出目录
  const outputDir = "output";
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // ============ .env 变更检测 ============
  const currentEnv = readEnvFile();
  const snapshot = readEnvSnapshot(outputDir);

  if (snapshot) {
    const changed =
      snapshot.MG_MCP_TOKEN !== (currentEnv["MG_MCP_TOKEN"] || "") ||
      snapshot.MG_FILE_ID !== (currentEnv["MG_FILE_ID"] || "") ||
      snapshot.MG_LAYER_ID !== (currentEnv["MG_LAYER_ID"] || "");

    if (changed) {
      console.log("📝 检测到 .env 配置变更，清空 output 目录");
      clearOutputDir(outputDir);
      // 重建快照
      if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
      saveEnvSnapshot(currentEnv, outputDir);
    } else {
      console.log("✅ .env 配置未变更，保留 output 目录");
    }
  } else {
    // 首次运行，直接保存快照
    saveEnvSnapshot(currentEnv, outputDir);
  }

  // 仅重建模式：从本地文件重建 HTML
  if (isRebuildOnly) {
    await rebuildOnly(outputDir);
    return;
  }

  // ============ 完整流程 ============

  // Step 1: 从 MasterGo 获取原始 DSL
  console.log("📥 Step 1: 从 MasterGo 获取原始 DSL...");
  const masterGoDSL = await fetchMasterGoDSL();

  // 保存原始 DSL
  const originalDSLPath = join(outputDir, "original-dsl.json");
  writeFileSync(originalDSLPath, JSON.stringify(masterGoDSL, null, 2), "utf-8");
  console.log(`✅ 原始 DSL 已保存: ${originalDSLPath}\n`);

  // Step 2: 转换为机器 DSL
  console.log("🔄 Step 2: 转换为机器 DSL...");
  const machineDSL = convertMasterGoToMachine(masterGoDSL);

  // 保存机器 DSL
  const machineDSLPath = join(outputDir, "machine-dsl.json");
  writeFileSync(machineDSLPath, JSON.stringify(machineDSL, null, 2), "utf-8");
  console.log(`✅ 机器 DSL 已保存: ${machineDSLPath}\n`);

  // Step 3: 生成预览 HTML
  console.log("🎨 Step 3: 生成预览 HTML...");
  const originalDslData = extractOriginalDslData(masterGoDSL);
  const previewHTML = await generatePreviewHTML(machineDSL, { originalDslData });

  const previewHTMLPath = join(outputDir, "preview.html");
  writeFileSync(previewHTMLPath, previewHTML, "utf-8");
  console.log(`✅ 预览 HTML 已保存: ${previewHTMLPath}`);
  console.log("   请在浏览器中打开此文件，并使用插件进行编辑\n");

  // Step 4: 应用 Patch（如果存在）
  console.log("🔧 Step 4: 检查并应用 Patch...");
  const patchResult = await applyPatchesFromDir(outputDir, machineDSL);
  const finalDSL = patchResult.dsl;
  const hasPatches = patchResult.hasPatches;

  // Step 5: 截图对比（HTML vs 设计稿）
  const skipValidate = args.includes("--skip-validate");
  if (!skipValidate) {
    console.log("📸 Step 5: Section 级截图对比...");
    try {
      const nodeMap = new Map<string, any>();
      for (const node of finalDSL.nodes) nodeMap.set(node.id, node);
      const sections = splitSections(finalDSL);

      const validation = await runValidationPipeline(
        finalDSL, sections, nodeMap, null as any, previewHTML,
        { maxAttempts: 3, enableLLMCorrection: !!process.env.LLM_API_KEY, outputDir },
      );

      console.log(`   Baseline: ${validation.baselineSource}`);
      console.log(`   对比完成: ${validation.results.length} sections`);
      for (const r of validation.results) {
        const icon = r.converged ? "✅" : "⚠️";
        console.log(`   ${icon} ${r.sectionName} (${r.kind}) — diff: ${(r.htmlDiffPercent * 100).toFixed(1)}% — ${r.attempts} attempts${r.corrected ? " (LLM corrected)" : ""}`);
      }
      console.log(`   平均差异: ${(validation.totalHTMLDiff * 100).toFixed(1)}% | ${validation.allConverged ? "全部收敛" : "部分未收敛"}\n`);
    } catch (err: any) {
      console.log(`   ⚠️  截图对比跳过: ${err.message}\n`);
    }
  } else {
    console.log("⏭️  Step 5: 截图对比已跳过 (--skip-validate)\n");
  }

  // Step 6: 保存应用 patch 后的 DSL
  console.log("💾 Step 6: 保存应用 patch 后的 DSL...");
  const finalDSLPath = join(outputDir, "final-machine-dsl.json");
  writeFileSync(finalDSLPath, JSON.stringify(finalDSL, null, 2), "utf-8");
  console.log(`✅ 应用 patch 后的 DSL 已保存: ${finalDSLPath}\n`);

  // 仅在有 patch 时重新生成预览 HTML
  if (hasPatches) {
    console.log("🎨 重新生成包含 patch 的预览 HTML...");
    const finalPreviewHTML = await generatePreviewHTML(finalDSL, { originalDslData });
    const finalPreviewPath = join(outputDir, "preview-final.html");
    writeFileSync(finalPreviewPath, finalPreviewHTML, "utf-8");
    console.log(`✅ 最终预览 HTML 已保存: ${finalPreviewPath}\n`);

    // 也更新 preview.html
    writeFileSync(join(outputDir, "preview.html"), finalPreviewHTML, "utf-8");
  } else {
    console.log("⏭️  无 patch，跳过重新生成预览 HTML\n");
  }

  console.log("🎉 完成！HTML 已生成到 output 目录");
  console.log("   请在浏览器中校准 HTML，然后运行 npm run generate-react 生成 React 代码\n");
}

/**
 * 仅重建模式：从本地文件重建 HTML（不重新获取 DSL）
 */
async function rebuildOnly(outputDir: string) {
  console.log("🔄 重建模式：仅从本地文件重建 HTML\n");

  const machineDSLPath = join(outputDir, "machine-dsl.json");
  if (!existsSync(machineDSLPath)) {
    console.error("❌ machine-dsl.json 不存在，请先运行 npm run dev");
    process.exit(1);
  }

  // 尝试加载原始 DSL 数据
  let originalDslData = null;
  const originalDSLPath = join(outputDir, "original-dsl.json");
  if (existsSync(originalDSLPath)) {
    try {
      const originalDSL = JSON.parse(readFileSync(originalDSLPath, "utf-8"));
      originalDslData = extractOriginalDslData(originalDSL);
      console.log("📖 已加载原始 DSL 数据");
    } catch (e: any) {
      console.warn(`⚠️ 加载原始 DSL 失败: ${e.message}`);
    }
  }

  console.log("📖 读取 machine-dsl.json...");
  let dsl = JSON.parse(readFileSync(machineDSLPath, "utf-8"));

  // 应用 patches
  const patchResult = await applyPatchesFromDir(outputDir, dsl);
  dsl = patchResult.dsl;

  // 保存应用 patch 后的 DSL
  const finalDSLPath = join(outputDir, "final-machine-dsl.json");
  writeFileSync(finalDSLPath, JSON.stringify(dsl, null, 2), "utf-8");
  console.log(`✅ 应用 patch 后的 DSL 已保存: ${finalDSLPath}`);

  // 生成 HTML
  console.log("🎨 生成 preview.html...");
  const html = await generatePreviewHTML(dsl, { originalDslData });
  const finalPath = join(outputDir, "preview-final.html");
  writeFileSync(finalPath, html, "utf-8");
  console.log(`✅ 已保存: ${finalPath}`);

  const previewPath = join(outputDir, "preview.html");
  writeFileSync(previewPath, html, "utf-8");
  console.log(`✅ 已保存: ${previewPath}`);

  // 截图对比
  const skipValidate = args.includes("--skip-validate");
  if (!skipValidate) {
    console.log("📸 Section 级截图对比...");
    try {
      const nodeMap = new Map<string, any>();
      for (const node of dsl.nodes) nodeMap.set(node.id, node);
      const sections = splitSections(dsl);

      const validation = await runValidationPipeline(
        dsl, sections, nodeMap, null as any, html,
        { maxAttempts: 3, enableLLMCorrection: !!process.env.LLM_API_KEY },
      );

      console.log(`   对比完成: ${validation.results.length} sections`);
      for (const r of validation.results) {
        const icon = r.converged ? "✅" : "⚠️";
        console.log(`   ${icon} ${r.sectionName} (${r.kind}) — diff: ${(r.htmlDiffPercent * 100).toFixed(1)}% — ${r.attempts} attempts${r.corrected ? " (LLM corrected)" : ""}`);
      }
      console.log(`   平均差异: ${(validation.totalHTMLDiff * 100).toFixed(1)}% | ${validation.allConverged ? "全部收敛" : "部分未收敛"}\n`);
    } catch (err: any) {
      console.log(`   ⚠️  截图对比跳过: ${err.message}\n`);
    }
  }

  console.log("🎉 重建完成！");
  console.log("   请在浏览器中校准 HTML，然后运行 npm run generate-react 生成 React 代码\n");
}

/**
 * 从 patches/ 目录读取并应用 patch
 * 同时写入 patches.json（兼容旧流程）
 */
async function applyPatchesFromDir(outputDir: string, machineDSL: any): Promise<{ dsl: any; hasPatches: boolean }> {
  const patchesDir = join(outputDir, "patches");
  const patchPath = join(outputDir, "patches.json");

  // 读取已合并的文件记录
  let alreadyMerged: Set<string> = new Set();
  if (existsSync(patchPath)) {
    try {
      const doc = JSON.parse(readFileSync(patchPath, "utf-8"));
      if (Array.isArray(doc.mergedFiles)) {
        doc.mergedFiles.forEach((f: string) => alreadyMerged.add(f));
      }
    } catch {}
  }

  // 优先从 patches/ 目录读取新文件
  if (existsSync(patchesDir)) {
    const allFiles = readdirSync(patchesDir).filter((f) => f.endsWith(".json") && f !== "patches.json");
    const newFiles = allFiles.filter((f) => !alreadyMerged.has(f));

    if (newFiles.length > 0) {
      console.log(`   📁 从 patches/ 目录读取 ${newFiles.length} 个新 patch 文件`);

      const allPatches: any[] = [];
      for (const file of newFiles) {
        try {
          const content = readFileSync(join(patchesDir, file), "utf-8");
          const patch = JSON.parse(content);
          if (Array.isArray(patch.patches)) {
            allPatches.push(...patch.patches);
          } else if (patch.targetNodeId) {
            allPatches.push(patch);
          }
        } catch (e) {
          console.warn(`   ⚠️  读取 ${file} 失败`);
        }
      }

      // 按 targetNodeId + op 合并去重
      const mergedMap = new Map<string, any>();
      for (const p of allPatches) {
        const key = `${p.targetNodeId}__${p.op}`;
        if (mergedMap.has(key)) {
          mergedMap.get(key).payload = { ...mergedMap.get(key).payload, ...p.payload };
        } else {
          mergedMap.set(key, { ...p });
        }
      }

      const merged = Array.from(mergedMap.values());
      console.log(`   合并后共 ${merged.length} 个有效 patch`);

      // 追加到 patches.json
      let existingPatches: any[] = [];
      if (existsSync(patchPath)) {
        try {
          const doc = JSON.parse(readFileSync(patchPath, "utf-8"));
          existingPatches = Array.isArray(doc.patches) ? doc.patches : [];
        } catch {}
      }

      for (const p of merged) {
        const key = `${p.targetNodeId}__${p.op}`;
        const existing = existingPatches.find((ep) => `${ep.targetNodeId}__${ep.op}` === key);
        if (existing) {
          existing.payload = { ...existing.payload, ...p.payload };
        } else {
          existingPatches.push(p);
        }
      }

      const allMergedFiles = new Set([...alreadyMerged, ...newFiles]);
      const patchDoc: PatchDocument = {
        version: 1,
        mergedAt: new Date().toISOString(),
        mergedFiles: Array.from(allMergedFiles),
        patches: existingPatches,
      };
      writeFileSync(patchPath, JSON.stringify(patchDoc, null, 2), "utf-8");
      console.log(`   已写入 patches.json`);

      return { dsl: applyPatches(machineDSL, patchDoc), hasPatches: true };
    }
  }

  // 回退：直接从 patches.json 读取
  if (existsSync(patchPath)) {
    const patchDoc: PatchDocument = JSON.parse(readFileSync(patchPath, "utf-8"));
    if (patchDoc.patches && patchDoc.patches.length > 0) {
      console.log(`   从 patches.json 读取 ${patchDoc.patches.length} 个 patch`);
      return { dsl: applyPatches(machineDSL, patchDoc), hasPatches: true };
    }
  }

  console.log("   未找到 patch 文件");
  return { dsl: machineDSL, hasPatches: false };
}

/**
 * 从 MasterGo 获取 DSL
 */
async function fetchMasterGoDSL() {
  // 检查环境变量
  const token = process.env.MG_MCP_TOKEN;
  const fileId = process.env.MG_FILE_ID || "190096496279041";
  const layerId = process.env.MG_LAYER_ID || "11:1602";

  if (!token) {
    throw new Error("请设置环境变量 MG_MCP_TOKEN");
  }

  console.log(`   File ID: ${fileId}`);
  console.log(`   Layer ID: ${layerId}`);

  const transport = new StdioClientTransport({
    command: "node",
    args: ["node_modules/@mastergo/magic-mcp/dist/index.js"],
    env: {
      MG_MCP_TOKEN: token,
      API_BASE_URL: "https://mastergo.com",
    },
  });

  const client = new Client({ name: "mastergo-dsl-toolchain", version: "1.0.0" });

  await client.connect(transport);

  const res = await client.callTool({
    name: "mcp__getDsl",
    arguments: {
      fileId,
      layerId,
    },
  });

  await client.close();

  // 从 MCP 响应中提取文本内容并解析为 JSON
  const content = res.content as Array<{ type: string; text: string }> | undefined;
  const textContent = content?.[0];
  if (!textContent || textContent.type !== "text") {
    throw new Error("响应中没有文本内容");
  }

  return JSON.parse(textContent.text);
}

// 运行主函数
main().catch(error => {
  console.error("❌ 错误:", error);
  process.exit(1);
});
