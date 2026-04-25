import { describe, it, expect } from "vitest";
import { buildCSSClasses, generateCSSClassBlock } from "../css-optimizer";
import { extractDesignTokens } from "../token-extractor";
import type { MachineDSL, DSLNode } from "../../types/machine-dsl";

function makeNode(overrides: Partial<DSLNode> = {}): DSLNode {
  return {
    id: "node-1",
    type: "container",
    parentId: null,
    children: [],
    layout: {},
    style: {},
    ...overrides,
  };
}

function makeDSL(nodes: DSLNode[]): MachineDSL {
  return {
    page: { id: "root", name: "Test", width: 1440, height: 1000 },
    nodes,
  };
}

describe("buildCSSClasses", () => {
  it("creates shared class for identical nodes", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", type: "text", style: { color: "#1a1a2e", fontSize: 14 } }),
      makeNode({ id: "n2", type: "text", style: { color: "#1a1a2e", fontSize: 14 } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);

    // Both nodes share the same style → 1 class
    expect(classMap.classes.size).toBe(1);
    expect(classMap.nodeClasses.size).toBe(2);
    expect(classMap.nodeInlineStyles.size).toBe(0);
  });

  it("uses inline style for unique nodes", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", type: "text", style: { color: "#aaa" } }),
      makeNode({ id: "n2", type: "text", style: { color: "#bbb" } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);

    // Different styles → no shared classes, both inline
    expect(classMap.classes.size).toBe(0);
    expect(classMap.nodeInlineStyles.size).toBe(2);
  });

  it("references CSS variables from tokens", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { color: "#1a1a2e" } }),
      makeNode({ id: "n2", style: { color: "#1a1a2e" } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);

    // The class body should reference var(--color-...)
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("var(--color-");
  });

  it("generates flex layout CSS", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", layout: { mode: "flex", direction: "row", gap: 24 }, children: ["n2"] }),
      makeNode({ id: "n2", layout: { mode: "flex", direction: "row", gap: 24 }, children: ["n3"] }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);

    const body = [...classMap.classes.values()][0];
    expect(body).toContain("display:flex");
    expect(body).toContain("flex-direction:row");
  });
});

describe("generateCSSClassBlock", () => {
  it("generates valid CSS class block", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", type: "text", style: { color: "#000" } }),
      makeNode({ id: "n2", type: "text", style: { color: "#000" } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);
    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);

    const block = generateCSSClassBlock(classMap);
    expect(block).toMatch(/^\.(dsl-t|dsl-c|dsl-img|dsl-btn)-\d+ \{/m);
  });
});

describe("buildCSSClasses — additional coverage", () => {
  it("handles image nodes correctly", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", type: "image", layout: { width: 200, height: 100 } }),
      makeNode({ id: "n2", type: "image", layout: { width: 200, height: 100 } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("width:200px");
    expect(body).toContain("height:100px");
  });

  it("handles absolute positioned nodes", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", layout: { mode: "absolute", x: 10, y: 20 } }),
      makeNode({ id: "n2", layout: { mode: "absolute", x: 10, y: 20 } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("position:relative");
    expect(body).toContain("left:10px");
  });

  it("handles background-image nodes", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { backgroundImage: "http://example.com/img.png" } }),
      makeNode({ id: "n2", style: { backgroundImage: "http://example.com/img.png" } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("background-image:url");
    expect(body).toContain("background-size:cover");
  });

  it("handles text with all font properties", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", type: "text", style: { fontFamily: "Poppins", fontWeight: 600, fontSize: 16, lineHeight: 24, textAlign: "center" } }),
      makeNode({ id: "n2", type: "text", style: { fontFamily: "Poppins", fontWeight: 600, fontSize: 16, lineHeight: 24, textAlign: "center" } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("font-weight:600");
    expect(body).toContain("font-size:16px");
    expect(body).toContain("text-align:center");
  });

  it("handles padding with non-uniform values", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { padding: { top: 8, right: 16, bottom: 8, left: 16 } } }),
      makeNode({ id: "n2", style: { padding: { top: 8, right: 16, bottom: 8, left: 16 } } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("padding:8px 16px 8px 16px");
  });

  it("handles border and shadow", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { border: "1px solid #ccc", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" } }),
      makeNode({ id: "n2", style: { border: "1px solid #ccc", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" } }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("border:1px solid #ccc");
    expect(body).toContain("box-shadow:");
  });

  it("handles flex container with column direction", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", layout: { mode: "flex", direction: "column", align: "center", justify: "flex-start" }, children: ["c1"] }),
      makeNode({ id: "n2", layout: { mode: "flex", direction: "column", align: "center", justify: "flex-start" }, children: ["c2"] }),
    ]);
    const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));
    const tokens = extractDesignTokens(dsl);

    const classMap = buildCSSClasses(dsl.nodes, nodeMap, tokens);
    const body = [...classMap.classes.values()][0];
    expect(body).toContain("flex-direction:column");
    expect(body).toContain("align-items:center");
    expect(body).toContain("justify-content:flex-start");
  });
});
