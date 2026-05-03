/**
 * 可视化 HTTP + WebSocket 服务器
 *
 * 端口 3457，提供 dashboard 页面、静态产物、WebSocket 实时事件。
 */

import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { runVisualizerPipeline } from "./orchestrator.js";
import type { VisualizerEvent } from "./types.js";

const PORT = 3457;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "output");
const DASHBOARD_PATH = join(__dirname, "dashboard.html");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".html": "text/html",
  ".json": "application/json",
  ".js": "application/javascript",
  ".css": "text/css",
};

let pipelineRunning = false;
let latestReport: string | null = null;

// ========== HTTP Server ==========

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // GET / — dashboard
  if (req.method === "GET" && url.pathname === "/") {
    const html = readFileSync(DASHBOARD_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders });
    res.end(html);
    return;
  }

  // GET /artifacts/* — 静态产物
  if (req.method === "GET" && url.pathname.startsWith("/artifacts/")) {
    const relPath = url.pathname.slice("/artifacts/".length);
    const absPath = join(OUTPUT_DIR, "visualizer", relPath);
    if (!existsSync(absPath)) {
      res.writeHead(404, corsHeaders);
      res.end("Not found");
      return;
    }
    const ext = extname(absPath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = readFileSync(absPath);
    res.writeHead(200, { "Content-Type": contentType, ...corsHeaders });
    res.end(data);
    return;
  }

  // GET /api/report — 最新报告
  if (req.method === "GET" && url.pathname === "/api/report") {
    const reportPath = join(OUTPUT_DIR, "visualizer", "report.json");
    if (existsSync(reportPath)) {
      const report = readFileSync(reportPath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(report);
    } else {
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ sections: [], summary: null }));
    }
    return;
  }

  // POST /api/reset — 清除产物缓存
  if (req.method === "POST" && url.pathname === "/api/reset") {
    const vizDir = join(OUTPUT_DIR, "visualizer");
    if (existsSync(vizDir)) rmSync(vizDir, { recursive: true, force: true });
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ reset: true }));
    return;
  }

  // POST /api/start — 启动管线（先清缓存）
  if (req.method === "POST" && url.pathname === "/api/start") {
    if (pipelineRunning) {
      res.writeHead(409, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: "Pipeline already running" }));
      return;
    }

    pipelineRunning = true;
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ started: true }));

    // 先清旧产物
    const vizDir = join(OUTPUT_DIR, "visualizer");
    if (existsSync(vizDir)) rmSync(vizDir, { recursive: true, force: true });

    runVisualizerPipeline(broadcast, { outputDir: OUTPUT_DIR })
      .catch((err) => {
        broadcast({ type: "pipeline:error", data: { message: err.message } });
      })
      .finally(() => {
        pipelineRunning = false;
      });

    return;
  }

  // GET /api/status
  if (req.method === "GET" && url.pathname === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({
      running: pipelineRunning,
      hasDSL: existsSync(join(OUTPUT_DIR, "machine-dsl.json")),
      hasBaseline: existsSync(join(OUTPUT_DIR, "design-baseline.png")),
    }));
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end("Not found");
});

// ========== WebSocket ==========

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "connected", data: { port: PORT } }));
});

function broadcast(event: VisualizerEvent): void {
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ========== Start ==========

server.listen(PORT, () => {
  console.log(`\n  DSL-to-HTML Visualizer`);
  console.log(`  → http://localhost:${PORT}\n`);
});
