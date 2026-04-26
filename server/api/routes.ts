/**
 * DSL2React API 路由
 * 核心端点：DSL 上传、生成、状态查询、Patch、重置
 */

import { Router } from "express";
import { InMemoryStore } from "../../src/store/in-memory-store.js";
import { extractDesignTokens } from "../../src/generators/token-extractor.js";
import { splitSections } from "../../src/generators/section-splitter.js";
import { generatePreviewHTML } from "../../src/generators/html-preview.js";
import { generateReactApp } from "../../src/generators/react-section-generator.js";
import { buildDependencyGraph } from "../../src/store/dependency-graph.js";
import type { MachineDSL, DSLNode } from "../../src/types/machine-dsl.js";

export function createAPIRouter(store: InMemoryStore): Router {
  const router = Router();

  // POST /api/v1/dsl — 上传 Machine DSL
  router.post("/dsl", (req, res) => {
    try {
      const dsl = req.body as MachineDSL;
      if (!dsl?.page || !Array.isArray(dsl?.nodes)) {
        res.status(400).json({ error: "Invalid DSL: missing page or nodes" });
        return;
      }

      store.setDSL(dsl);

      const nodeMap = new Map<string, DSLNode>();
      for (const node of dsl.nodes) nodeMap.set(node.id, node);

      const tokens = extractDesignTokens(dsl);
      store.setTokens(tokens);

      const sections = splitSections(dsl);
      store.setSections(sections);

      const graph = buildDependencyGraph(sections, nodeMap);

      res.json({
        page: dsl.page,
        stats: {
          nodeCount: dsl.nodes.length,
          sectionCount: sections.length,
          tokenCount: tokens.colors.variables.size + tokens.fonts.variables.size +
            tokens.spacings.variables.size + tokens.radii.variables.size +
            tokens.shadows.variables.size,
        },
        sections: sections.map(s => ({
          id: s.id,
          name: s.name,
          nodeId: s.nodeId,
          complexity: Math.round(s.complexity),
          nodeCount: s.nodeIds.length,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/generate — 生成 HTML + React 代码
  router.post("/generate", (req, res) => {
    try {
      const dsl = store.getDSL();
      if (!dsl) {
        res.status(400).json({ error: "No DSL loaded. POST to /api/v1/dsl first." });
        return;
      }

      const previewHTML = generatePreviewHTML(dsl);
      const reactOutput = generateReactApp(dsl);
      store.setReactOutput(reactOutput);

      res.json({
        previewHTMLSize: previewHTML.length,
        reactOutput: {
          appTSXSize: reactOutput.appTSX.length,
          appCSSSize: reactOutput.appCSS.length,
          sectionCount: reactOutput.sections.length,
          sections: reactOutput.sections.map(s => ({
            fileName: s.fileName,
            size: s.code.length,
          })),
        },
        previewHTML,
        files: {
          "App.tsx": reactOutput.appTSX,
          "App.css": reactOutput.appCSS,
          ...Object.fromEntries(
            reactOutput.sections.map(s => [`sections/${s.fileName}`, s.code])
          ),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/status — 查询当前状态
  router.get("/status", (_req, res) => {
    const dsl = store.getDSL();
    const sections = store.getSections();
    const tokens = store.getTokens();
    const reactOutput = store.getReactOutput();
    const patches = store.getPatches();

    res.json({
      hasDSL: !!dsl,
      page: dsl?.page || null,
      sectionCount: sections.length,
      tokenCount: tokens
        ? tokens.colors.variables.size + tokens.fonts.variables.size +
          tokens.spacings.variables.size + tokens.radii.variables.size +
          tokens.shadows.variables.size
        : 0,
      hasReactOutput: !!reactOutput,
      patchCount: patches.length,
    });
  });

  // POST /api/v1/patch — 应用 Patch
  router.post("/patch", (req, res) => {
    try {
      const { targetNodeId, op, payload } = req.body;
      if (!targetNodeId || !op || !payload) {
        res.status(400).json({ error: "Missing targetNodeId, op, or payload" });
        return;
      }

      store.addPatch({
        id: `patch-${Date.now()}`,
        targetNodeId,
        op,
        payload,
        appliedAt: new Date().toISOString(),
      });

      const dsl = store.getDSL();
      if (!dsl) {
        res.json({ applied: true, regenerated: false });
        return;
      }

      const reactOutput = generateReactApp(dsl);
      store.setReactOutput(reactOutput);

      res.json({
        applied: true,
        regenerated: true,
        sectionCount: reactOutput.sections.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/reset — 重置会话
  router.post("/reset", (_req, res) => {
    store.reset();
    res.json({ reset: true });
  });

  return router;
}
