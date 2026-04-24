/**
 * MasterGo DSL 重建服务
 * 提供 HTTP API 触发增量重建（不重新从 MasterGo 获取 DSL）
 * 运行: npm run server
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, mkdirSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "output");
const PATCHES_DIR = join(OUTPUT_DIR, "patches");
const HISTORY_DIR = join(OUTPUT_DIR, "patches", "history");
const REACT_APP_DIR = join(PROJECT_ROOT, "react-app", "src");
const ENV_FILE = join(PROJECT_ROOT, ".env");
const GEN_CONFIG_FILE = join(PROJECT_ROOT, "gen.config.json");
const PORT = 3456;

// 确保目录存在
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
if (!existsSync(PATCHES_DIR)) mkdirSync(PATCHES_DIR, { recursive: true });
if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

/**
 * 读取 patches.json 中的已合并文件列表
 */
function getMergedFiles(): Set<string> {
  const patchPath = join(OUTPUT_DIR, "patches.json");
  if (!existsSync(patchPath)) return new Set();

  try {
    const doc = JSON.parse(readFileSync(patchPath, "utf-8"));
    // 读取历史记录中所有已合并的文件
    const merged = new Set<string>();
    if (Array.isArray(doc.mergedFiles)) {
      doc.mergedFiles.forEach((f: string) => merged.add(f));
    }
    return merged;
  } catch {
    return new Set();
  }
}

/**
 * 合并 patches/ 目录下的新 patch 文件到 patches.json
 * - 只处理从未被合并过的文件
 * - 已合并的文件移到 patches/history/
 * - 合并策略：同一 targetNodeId + op 的多次改动，payload 深度合并
 */
function mergePatches(): { merged: number; newFiles: string[]; errors: string[] } {
  if (!existsSync(PATCHES_DIR)) {
    return { merged: 0, newFiles: [], errors: ["patches 目录不存在"] };
  }

  const allFiles = readdirSync(PATCHES_DIR).filter((f) => f.endsWith(".json") && f !== "patches.json");
  if (allFiles.length === 0) {
    return { merged: 0, newFiles: [], errors: [] };
  }

  const alreadyMerged = getMergedFiles();
  const newFiles = allFiles.filter((f) => !alreadyMerged.has(f));

  if (newFiles.length === 0) {
    return { merged: 0, newFiles: [], errors: [] };
  }

  console.log(`   发现 ${newFiles.length} 个新 patch 文件`);

  const allPatches: any[] = [];
  const errors: string[] = [];

  for (const file of newFiles) {
    try {
      const content = readFileSync(join(PATCHES_DIR, file), "utf-8");
      const patch = JSON.parse(content);
      if (Array.isArray(patch.patches)) {
        allPatches.push(...patch.patches);
      } else if (patch.targetNodeId) {
        // 单个 patch 格式
        allPatches.push(patch);
      }
    } catch (e: any) {
      errors.push(`读取 ${file} 失败: ${e.message}`);
    }
  }

  // 合并策略：同一 targetNodeId + op 的 payload 深度合并
  const mergedMap = new Map<string, any>();
  for (const p of allPatches) {
    const key = `${p.targetNodeId}__${p.op}`;
    if (mergedMap.has(key)) {
      mergedMap.get(key).payload = deepMerge(mergedMap.get(key).payload, p.payload);
    } else {
      mergedMap.set(key, { ...p });
    }
  }

  const merged = Array.from(mergedMap.values());

  // 读取现有 patches（用于追加）
  let existingPatches: any[] = [];
  const patchPath = join(OUTPUT_DIR, "patches.json");
  if (existsSync(patchPath)) {
    try {
      const doc = JSON.parse(readFileSync(patchPath, "utf-8"));
      existingPatches = Array.isArray(doc.patches) ? doc.patches : [];
    } catch {}
  }

  // 与现有 patch 再次合并去重
  for (const p of merged) {
    const key = `${p.targetNodeId}__${p.op}`;
    const existing = existingPatches.find((ep) => `${ep.targetNodeId}__${ep.op}` === key);
    if (existing) {
      existing.payload = deepMerge(existing.payload, p.payload);
    } else {
      existingPatches.push(p);
    }
  }

  // 收集所有已合并文件
  const allMergedFiles = new Set([...alreadyMerged, ...newFiles]);

  const patchDoc = {
    version: 1,
    mergedAt: new Date().toISOString(),
    mergedFiles: Array.from(allMergedFiles),
    patches: existingPatches,
  };

  writeFileSync(patchPath, JSON.stringify(patchDoc, null, 2), "utf-8");
  console.log(`   已合并到 patches.json（共 ${existingPatches.length} 个有效 patch）`);

  // 将新文件移到 history/
  for (const file of newFiles) {
    try {
      const src = join(PATCHES_DIR, file);
      const dst = join(HISTORY_DIR, file);
      renameSync(src, dst);
      console.log(`   📦 移入历史: patches/history/${file}`);
    } catch (e: any) {
      errors.push(`移动 ${file} 失败: ${e.message}`);
    }
  }

  return { merged: existingPatches.length, newFiles, errors };
}

/**
 * 深度合并对象
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  const out = { ...target };
  for (const key in source) {
    const sv = source[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && typeof out[key] === "object") {
      out[key] = deepMerge(out[key], sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

/**
 * 读取 gen.config.json
 */
function loadGenConfig(): any {
  if (!existsSync(GEN_CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(GEN_CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * 保存 gen.config.json
 */
function saveGenConfig(config: any): void {
  if (!config || (typeof config === 'object' && Object.keys(config).length === 0)) {
    // 空配置，删除文件
    if (existsSync(GEN_CONFIG_FILE)) {
      unlinkSync(GEN_CONFIG_FILE);
    }
    return;
  }
  // 确保 config 是普通对象
  const plainConfig = JSON.parse(JSON.stringify(config));
  writeFileSync(GEN_CONFIG_FILE, JSON.stringify(plainConfig, null, 2), "utf-8");
}

/**
 * 清空 output 目录（保留文件夹本身）
 */
function clearOutputDir(outputDir: string) {
  if (!existsSync(outputDir)) return;
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    const path = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      removeDirContents(path, true);
    } else {
      unlinkSync(path);
    }
  }
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
 * 重新构建 HTML（不重新获取 DSL）
 */
async function rebuildHTML(): Promise<{ success: boolean; error?: string }> {
  try {
    const { generatePreviewHTML } = await import("./generators/html-preview.js");
    const { applyPatches } = await import("./utils/patch.js");

    const machineDSLPath = join(OUTPUT_DIR, "machine-dsl.json");
    const patchPath = join(OUTPUT_DIR, "patches.json");

    if (!existsSync(machineDSLPath)) {
      return { success: false, error: "machine-dsl.json 不存在，请先运行 npm run dev" };
    }

    let dsl = JSON.parse(readFileSync(machineDSLPath, "utf-8"));

    if (existsSync(patchPath)) {
      const patchDoc = JSON.parse(readFileSync(patchPath, "utf-8"));
      dsl = applyPatches(dsl, patchDoc);
    }

    // 保存应用 patch 后的 DSL
    const finalDSLPath = join(OUTPUT_DIR, "final-machine-dsl.json");
    writeFileSync(finalDSLPath, JSON.stringify(dsl, null, 2), "utf-8");

    const html = generatePreviewHTML(dsl);
    const finalPath = join(OUTPUT_DIR, "preview-final.html");
    writeFileSync(finalPath, html, "utf-8");

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * HTTP 请求处理
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/status") {
    const machineExists = existsSync(join(OUTPUT_DIR, "machine-dsl.json"));
    const patchExists = existsSync(join(OUTPUT_DIR, "patches.json"));
    const pendingCount = existsSync(PATCHES_DIR)
      ? readdirSync(PATCHES_DIR).filter((f) => f.endsWith(".json") && f !== "patches.json").length
      : 0;
    const historyCount = existsSync(HISTORY_DIR)
      ? readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json")).length
      : 0;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        machineDslReady: machineExists,
        hasPatches: patchExists,
        pendingPatches: pendingCount,
        historyPatches: historyCount,
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/rebuild") {
    console.log("\n🔄 收到重建请求...");

    // 1. 合并新 patches
    const mergeResult = mergePatches();
    if (mergeResult.errors.length > 0) {
      console.warn("   合并警告:", mergeResult.errors);
    }
    console.log(`   新增合并 ${mergeResult.newFiles.length} 个 patch`);

    // 2. 重建 HTML
    const rebuildResult = await rebuildHTML();
    if (!rebuildResult.success) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: rebuildResult.error }));
      return;
    }

    console.log("   ✅ HTML 已重建: output/preview-final.html");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        mergedCount: mergeResult.merged,
        newFiles: mergeResult.newFiles,
        outputPath: join(OUTPUT_DIR, "preview-final.html"),
      })
    );
    return;
  }

  // 生成 React 代码并写入 react-app/src/App.tsx
  if (req.method === "POST" && url.pathname === "/generate-react") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { generateReactCode } = await import("./generators/react-code.js");
        const { matchComponents } = await import("./generators/component-match.js");
        const { mergeConfig } = await import("./generators/default-config.js");

        const finalDSLPath = join(OUTPUT_DIR, "final-machine-dsl.json");

        if (!existsSync(finalDSLPath)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "final-machine-dsl.json 不存在，请先运行 npm run dev" }));
          return;
        }

        // 解析请求体中的配置
        let requestConfig: any = {};
        try {
          if (body && body.trim()) {
            const parsed = JSON.parse(body);
            requestConfig = parsed.config || parsed;
          }
        } catch (e) {
          console.warn("解析请求配置失败:", e);
        }

        // 合并文件配置与请求配置
        const fileConfig = loadGenConfig();
        const mergedConfig = {
          ...fileConfig,
          ...requestConfig,
        };

        // 保存合并后的配置
        saveGenConfig(mergedConfig);
        const config = mergeConfig(mergedConfig);

        const dsl = JSON.parse(readFileSync(finalDSLPath, "utf-8"));

        // 匹配组件
        let matches: any[] = [];
        if (config.components && config.components.length > 0) {
          matches = await matchComponents(dsl.nodes || [], config.components);
        }

        // 生成代码
        const result = generateReactCode(dsl, { config, componentMatches: matches });

        // 确保 code 是字符串
        if (typeof result.code !== 'string') {
          throw new Error(`生成代码类型错误: ${typeof result.code}`);
        }

        // 写入 App.tsx
        const appPath = join(REACT_APP_DIR, "App.tsx");
        writeFileSync(appPath, result.code, "utf-8");

        // 写入样式文件
        if (result.cssFile && result.cssContent) {
          const cssPath = join(REACT_APP_DIR, result.cssFile);
          writeFileSync(cssPath, result.cssContent, "utf-8");
          console.log(`\n⚛️  样式文件已生成: react-app/src/${result.cssFile}`);
        }

        console.log(`\n⚛️  React 代码已生成: react-app/src/App.tsx`);
        console.log(`   样式模式: ${config.styleMode || 'inline'}`);
        console.log(`   组件匹配: ${matches.length} 个`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          outputPath: appPath,
          cssFile: result.cssFile,
          nodeCount: dsl.nodes?.length || 0,
          matchCount: matches.length,
        }));
      } catch (e: any) {
        console.error("生成 React 失败:", e);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 保存单个 patch 文件到 patches/
  if (req.method === "POST" && url.pathname === "/save-patch") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { filename, content } = JSON.parse(body);
        if (!filename) throw new Error("缺少 filename");
        if (typeof content !== 'string') throw new Error("content 必须是字符串");
        const filePath = join(PATCHES_DIR, filename);
        writeFileSync(filePath, content, "utf-8");
        console.log(`   💾 保存 patch: ${filename}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, filename }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 清空 output 目录
  if (req.method === "POST" && url.pathname === "/reset-output") {
    try {
      clearOutputDir(OUTPUT_DIR);
      if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log("\n🗑️  output 目录已清空（通过 API）");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 列出历史 patch 文件
  if (req.method === "GET" && url.pathname === "/history") {
    if (!existsSync(HISTORY_DIR)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([]));
      return;
    }
    const files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
    return;
  }

  // 读取 .env 配置
  if (req.method === "GET" && url.pathname === "/env") {
    try {
      let MG_MCP_TOKEN = "";
      let MG_FILE_ID = "";
      let MG_LAYER_ID = "";
      let _url = "";

      if (existsSync(ENV_FILE)) {
        const content = readFileSync(ENV_FILE, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx);
            const val = trimmed.slice(eqIdx + 1).trim();
            if (key === "MG_MCP_TOKEN") MG_MCP_TOKEN = val;
            else if (key === "MG_FILE_ID") MG_FILE_ID = val;
            else if (key === "MG_LAYER_ID") MG_LAYER_ID = val;
            else if (key === "_MG_URL") _url = val;
          }
        }
      }

      // 重建完整 URL（如果有 fileId 和 layerId）
      if (!_url && MG_FILE_ID && MG_LAYER_ID) {
        _url = `https://mastergo.com/file/${MG_FILE_ID}?layer_id=${encodeURIComponent(MG_LAYER_ID)}`;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ MG_MCP_TOKEN, MG_FILE_ID, MG_LAYER_ID, _url }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 保存 .env 配置
  if (req.method === "POST" && url.pathname === "/env") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { MG_MCP_TOKEN, MG_FILE_ID, MG_LAYER_ID, _url } = JSON.parse(body);

        // 读取现有 .env 内容（保留其他配置）
        const lines: string[] = [];
        if (existsSync(ENV_FILE)) {
          lines.push(...readFileSync(ENV_FILE, "utf-8").split("\n"));
        }

        // 更新或追加配置项
        const setLine = (key: string, val: string) => {
          const idx = lines.findIndex((l) => l.trim().startsWith(key + "="));
          if (idx >= 0) {
            lines[idx] = `${key}=${val}`;
          } else {
            lines.push(`${key}=${val}`);
          }
        };

        if (MG_MCP_TOKEN !== undefined) setLine("MG_MCP_TOKEN", MG_MCP_TOKEN);
        if (MG_FILE_ID !== undefined) setLine("MG_FILE_ID", MG_FILE_ID);
        if (MG_LAYER_ID !== undefined) setLine("MG_LAYER_ID", MG_LAYER_ID);
        if (_url !== undefined) setLine("_MG_URL", _url);

        writeFileSync(ENV_FILE, lines.join("\n"), "utf-8");

        // 删除 .env.snapshot，下次运行会检测变更并清空 output
        const snapshotPath = join(OUTPUT_DIR, ".env.snapshot");
        if (existsSync(snapshotPath)) unlinkSync(snapshotPath);

        console.log("\n✏️  .env 配置已更新");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 读取 gen config
  if (req.method === "GET" && url.pathname === "/gen-config") {
    const config = loadGenConfig();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(config));
    return;
  }

  // 保存 gen config
  if (req.method === "POST" && url.pathname === "/gen-config") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const rawData = body.trim();
        const config = rawData ? JSON.parse(rawData) : {};
        saveGenConfig(config);
        console.log("\n✏️  gen.config.json 已更新");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (e: any) {
        console.error("保存 gen.config 失败:", e);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 清空 output 并运行 npm run dev
  if (req.method === "POST" && url.pathname === "/run-dev") {
    try {
      console.log("\n🚀 收到运行请求，清空 output 并启动 dev...\n");

      // 清空 output 内容
      clearOutputDir(OUTPUT_DIR);
      mkdirSync(OUTPUT_DIR, { recursive: true });
      mkdirSync(PATCHES_DIR, { recursive: true });
      mkdirSync(HISTORY_DIR, { recursive: true });

      // 重新创建 .env.snapshot（基于当前 .env）
      const envContent = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";
      const snapshot: Record<string, string> = {};
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx);
          if (key === "MG_MCP_TOKEN" || key === "MG_FILE_ID" || key === "MG_LAYER_ID") {
            snapshot[key] = trimmed.slice(eqIdx + 1).trim();
          }
        }
      }
      snapshot["snapshotAt"] = new Date().toISOString();
      writeFileSync(join(OUTPUT_DIR, ".env.snapshot"), JSON.stringify(snapshot, null, 2), "utf-8");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));

      // 异步启动 npm run dev（不等待完成）
      setTimeout(() => {
        console.log("   正在启动 npm run dev...\n");
        const child = spawn("npm", ["run", "dev"], {
          cwd: PROJECT_ROOT,
          stdio: "inherit",
          shell: true,
          detached: true,
        });
        child.unref();
      }, 100);
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n🚀 MasterGo DSL 重建服务已启动`);
  console.log(`   API: http://localhost:${PORT}`);
  console.log(`   - GET  /status           查看状态（pending/history 数量）`);
  console.log(`   - POST /save-patch       保存 patch 文件到 patches/`);
  console.log(`   - POST /rebuild          合并新 patch 并重建 HTML`);
  console.log(`   - POST /generate-react    生成 React 代码到 react-app/`);
  console.log(`   - POST /reset-output      清空 output 目录`);
  console.log(`   - GET  /env              读取 .env 配置`);
  console.log(`   - POST /env              保存 .env 配置`);
  console.log(`   - GET  /gen-config       读取生成配置`);
  console.log(`   - POST /gen-config       保存生成配置`);
  console.log(`   - POST /run-dev          清空 output 并运行 npm run dev`);
  console.log(`   - GET  /history         查看已合并的 patch 历史文件\n`);
});
