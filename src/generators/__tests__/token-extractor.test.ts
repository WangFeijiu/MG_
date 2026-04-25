import { describe, it, expect } from "vitest";
import { extractDesignTokens, generateCSSTokenBlock } from "../token-extractor";
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
    page: { id: "root", name: "Test Page", width: 1440, height: 1000 },
    nodes,
  };
}

describe("extractDesignTokens", () => {
  it("extracts colors from nodes", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { color: "#1a1a2e" } }),
      makeNode({ id: "n2", style: { color: "#1a1a2e" } }),
      makeNode({ id: "n3", style: { color: "#333" } }),
    ]);

    const tokens = extractDesignTokens(dsl);

    // #1a1a2e appears 2x → should be a token
    expect(tokens.colors.lookup.has("#1a1a2e")).toBe(true);
    // #333 appears 1x → should NOT be a token (below threshold)
    expect(tokens.colors.lookup.has("#333")).toBe(false);
  });

  it("extracts background colors", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { background: "#FFFFFF" } }),
      makeNode({ id: "n2", style: { background: "#FFFFFF" } }),
    ]);

    const tokens = extractDesignTokens(dsl);
    expect(tokens.colors.lookup.has("#FFFFFF")).toBe(true);
  });

  it("extracts font family", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { fontFamily: "Poppins", fontWeight: 600, fontSize: 14 } }),
      makeNode({ id: "n2", style: { fontFamily: "Poppins", fontWeight: 400, fontSize: 16 } }),
    ]);

    const tokens = extractDesignTokens(dsl);
    // Both nodes use Poppins → should have a single font token
    expect(tokens.fonts.variables.size).toBe(1);
    expect(tokens.fonts.lookup.has("Poppins")).toBe(true);
  });

  it("extracts spacing values from padding and gap", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { padding: { top: 24, right: 24, bottom: 24, left: 24 } } }),
      makeNode({ id: "n2", layout: { gap: 24 } }),
    ]);

    const tokens = extractDesignTokens(dsl);
    // 24 appears 5x (4 from padding + 1 from gap) → should be a token
    expect(tokens.spacings.lookup.has("24")).toBe(true);
  });

  it("extracts border radius", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { borderRadius: { linked: true, topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 } } }),
      makeNode({ id: "n2", style: { borderRadius: { linked: true, topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 } } }),
    ]);

    const tokens = extractDesignTokens(dsl);
    expect(tokens.radii.lookup.has("8")).toBe(true);
  });

  it("ignores single-occurrence values", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { color: "#unique" } }),
    ]);

    const tokens = extractDesignTokens(dsl);
    expect(tokens.colors.lookup.has("#unique")).toBe(false);
    expect(tokens.colors.variables.size).toBe(0);
  });
});

describe("generateCSSTokenBlock", () => {
  it("generates :root block with CSS variables", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { color: "#1a1a2e" } }),
      makeNode({ id: "n2", style: { color: "#1a1a2e" } }),
      makeNode({ id: "n3", style: { fontFamily: "Poppins" } }),
      makeNode({ id: "n4", style: { fontFamily: "Poppins" } }),
    ]);

    const tokens = extractDesignTokens(dsl);
    const css = generateCSSTokenBlock(tokens);

    expect(css).toContain(":root");
    expect(css).toContain("--color-");
    expect(css).toContain("#1a1a2e");
    expect(css).toContain("--font-");
    expect(css).toContain("Poppins");
  });
});
