/**
 * MasterGo DSL 重建服务
 * 提供 HTTP API 触发增量重建（不重新从 MasterGo 获取 DSL）
 * 运行: npm run server
 */

import http from "node:http";
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "output");
const PATCHES_DIR = join(OUTPUT_DIR, "patches");
const HISTORY_DIR = join(OUTPUT_DIR, "patches", "history");
const REACT_APP_DIR = join(__dirname, "..", "react-app", "src");
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
    try {
      const { generateReactCode } = await import("./generators/react-code.js");
      const { applyPatches } = await import("./utils/patch.js");

      const machineDSLPath = join(OUTPUT_DIR, "machine-dsl.json");
      const patchPath = join(OUTPUT_DIR, "patches.json");

      if (!existsSync(machineDSLPath)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "machine-dsl.json 不存在，请先运行 npm run dev" }));
        return;
      }

      let dsl = JSON.parse(readFileSync(machineDSLPath, "utf-8"));

      if (existsSync(patchPath)) {
        const patchDoc = JSON.parse(readFileSync(patchPath, "utf-8"));
        dsl = applyPatches(dsl, patchDoc);
      }

      const reactCode = generateReactCode(dsl);
      const appPath = join(REACT_APP_DIR, "App.tsx");
      writeFileSync(appPath, reactCode, "utf-8");

      console.log(`\n⚛️  React 代码已生成: react-app/src/App.tsx`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        outputPath: appPath,
        nodeCount: dsl.nodes?.length || 0,
      }));
    } catch (e: any) {
      console.error("生成 React 失败:", e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 保存单个 patch 文件到 patches/
  if (req.method === "POST" && url.pathname === "/save-patch") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { filename, content } = JSON.parse(body);
        if (!filename || !content) throw new Error("缺少 filename 或 content");
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
  console.log(`   - GET  /history         查看已合并的 patch 历史文件\n`);
});
