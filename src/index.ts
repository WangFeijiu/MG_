/**
 * MasterGo DSL 工具链主入口
 * 完整流程：MasterGo DSL → 机器 DSL → 预览 HTML → Patch → 最终代码
 */

import { config } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// 加载环境变量
config();

import { convertMasterGoToMachine } from "./converters/mastergo-to-machine.js";
import { generatePreviewHTML } from "./generators/html-preview.js";
import { generateReactCode } from "./generators/react-code.js";
import { applyPatches } from "./utils/patch.js";

import type { PatchDocument } from "./types/patch.js";

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
  const previewHTML = generatePreviewHTML(machineDSL);

  const previewHTMLPath = join(outputDir, "preview.html");
  writeFileSync(previewHTMLPath, previewHTML, "utf-8");
  console.log(`✅ 预览 HTML 已保存: ${previewHTMLPath}`);
  console.log("   请在浏览器中打开此文件，并使用插件进行编辑\n");

  // Step 4: 应用 Patch（如果存在）
  console.log("🔧 Step 4: 检查并应用 Patch...");
  const patchPath = join(outputDir, "patches.json");

  let finalDSL = machineDSL;

  if (existsSync(patchPath)) {
    const patchDoc: PatchDocument = JSON.parse(readFileSync(patchPath, "utf-8"));
    console.log(`   找到 ${patchDoc.patches.length} 个 patch`);

    finalDSL = applyPatches(machineDSL, patchDoc);

    // 保存应用 patch 后的 DSL
    const finalDSLPath = join(outputDir, "final-machine-dsl.json");
    writeFileSync(finalDSLPath, JSON.stringify(finalDSL, null, 2), "utf-8");
    console.log(`✅ 应用 patch 后的机器 DSL 已保存: ${finalDSLPath}\n`);
  } else {
    console.log("   未找到 patch 文件，使用原始机器 DSL\n");
  }

  // Step 5: 生成最终 React 代码
  console.log("⚛️  Step 5: 生成 React 代码...");
  const reactCode = generateReactCode(finalDSL);

  const reactCodePath = join(outputDir, `${finalDSL.page.name}.tsx`);
  writeFileSync(reactCodePath, reactCode, "utf-8");
  console.log(`✅ React 组件已保存: ${reactCodePath}\n`);

  // Step 6: 重新生成预览 HTML（包含 patch）
  if (finalDSL !== machineDSL) {
    console.log("🎨 Step 6: 重新生成包含 patch 的预览 HTML...");
    const finalPreviewHTML = generatePreviewHTML(finalDSL);

    const finalPreviewPath = join(outputDir, "preview-final.html");
    writeFileSync(finalPreviewPath, finalPreviewHTML, "utf-8");
    console.log(`✅ 最终预览 HTML 已保存: ${finalPreviewPath}\n`);
  }

  console.log("🎉 完成！所有文件已生成到 output 目录");
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
  const textContent = res.content?.[0];
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
