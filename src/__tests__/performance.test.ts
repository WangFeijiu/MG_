import { describe, it, expect } from "vitest";
import { extractDesignTokens } from "../generators/token-extractor.js";
import { buildCSSClasses } from "../generators/css-optimizer.js";
import { splitSections } from "../generators/section-splitter.js";
import { generatePreviewHTML } from "../generators/html-preview.js";
import { generateReactApp } from "../generators/react-section-generator.js";
import { incrementalRegenerate } from "../store/incremental-update.js";
import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";

function generateLargeDSL(sectionCount: number, nodesPerSection: number): MachineDSL {
  const nodes: DSLNode[] = [];
  const rootChildren: string[] = [];

  const root: DSLNode = {
    id: "root", type: "container", parentId: null, children: [],
    layout: { width: 1440 }, style: {},
  };

  for (let s = 0; s < sectionCount; s++) {
    const sectionId = `section-${s}`;
    rootChildren.push(sectionId);
    const sectionChildren: string[] = [];

    const section: DSLNode = {
      id: sectionId, type: "container", parentId: "root", children: [],
      layout: { width: 1440, height: 400 },
      style: { background: s % 2 === 0 ? "#ffffff" : "#f5f5f5" },
      name: `Section ${s}`,
    };

    for (let n = 0; n < nodesPerSection; n++) {
      const nodeId = `n-${s}-${n}`;
      sectionChildren.push(nodeId);

      const isText = n % 3 === 0;
      const node: DSLNode = {
        id: nodeId,
        type: isText ? "text" : "container",
        parentId: sectionId,
        children: [],
        layout: isText ? {} : { mode: "flex", direction: "row", gap: 8 },
        style: isText
          ? { color: "#333", fontSize: 14 + (n % 4) * 2, fontFamily: "Poppins" }
          : { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
        content: isText ? { text: `Text node ${s}-${n}` } : undefined,
      };
      nodes.push(node);
    }

    section.children = sectionChildren;
    nodes.push(section);
  }

  root.children = rootChildren;
  nodes.unshift(root);

  return {
    page: { id: "root", name: "Performance Test", width: 1440, height: 1000 },
    nodes,
  };
}

describe("Performance Benchmarks", () => {
  const dsl = generateLargeDSL(10, 20);

  it("extracts tokens in < 100ms", () => {
    const start = performance.now();
    extractDesignTokens(dsl);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("splits sections in < 100ms", () => {
    const start = performance.now();
    splitSections(dsl);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("generates preview HTML in < 500ms", async () => {
    const start = performance.now();
    await generatePreviewHTML(dsl, { useLLM: false });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it("generates React app in < 500ms", async () => {
    const start = performance.now();
    await generateReactApp(dsl);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it("incremental update completes in < 1s", async () => {
    const patches = [
      { targetNodeId: "n-0-0", op: "updateStyle", payload: { color: "red" } },
    ];

    const start = performance.now();
    await incrementalRegenerate(dsl, patches, null);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  it("handles 50-section DSL without excessive memory", async () => {
    const largeDSL = generateLargeDSL(50, 10);
    const memBefore = process.memoryUsage().heapUsed;

    await generateReactApp(largeDSL);

    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMB = (memAfter - memBefore) / 1024 / 1024;
    expect(memDeltaMB).toBeLessThan(50);
  });
});
