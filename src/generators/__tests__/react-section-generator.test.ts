import { describe, it, expect } from "vitest";
import { generateReactApp } from "../react-section-generator.js";
import type { MachineDSL, DSLNode } from "../../types/machine-dsl.js";

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

function makeDSL(nodes: DSLNode[], rootOverrides: Partial<DSLNode> = {}): MachineDSL {
  const rootId = rootOverrides.id || "root";
  return {
    page: { id: rootId, name: "Test Page", width: 1440, height: 1000 },
    nodes,
  };
}

describe("generateReactApp", () => {
  it("generates App.tsx with section imports", () => {
    const root = makeNode({ id: "root", children: ["s1", "s2", "s3"] });
    const s1 = makeNode({ id: "s1", name: "Hero", layout: { width: 1440 } });
    const s2 = makeNode({ id: "s2", name: "Features", layout: { width: 1440 } });
    const s3 = makeNode({ id: "s3", name: "Footer", layout: { width: 1440 } });

    const dsl = makeDSL([root, s1, s2, s3]);
    const result = generateReactApp(dsl);

    expect(result.appTSX).toContain("import React");
    expect(result.appTSX).toContain("export function App()");
    expect(result.appTSX).toContain("export default App");
    expect(result.sections).toHaveLength(3);
  });

  it("generates App.css with :root variables", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { color: "#1a1a2e" } }),
      makeNode({ id: "n2", style: { color: "#1a1a2e" } }),
      makeNode({ id: "root", children: ["n1", "n2"] }),
    ]);
    const result = generateReactApp(dsl);

    expect(result.appCSS).toContain(":root");
    expect(result.appCSS).toContain("--color-");
  });

  it("generates section component files", () => {
    const root = makeNode({ id: "root", children: ["s1", "s2", "s3"] });
    const s1 = makeNode({ id: "s1", name: "Hero" });
    const s2 = makeNode({ id: "s2", name: "Features" });
    const s3 = makeNode({ id: "s3", name: "Footer" });

    const dsl = makeDSL([root, s1, s2, s3]);
    const result = generateReactApp(dsl);

    for (const section of result.sections) {
      expect(section.fileName).toMatch(/\.tsx$/);
      expect(section.code).toContain("import React");
      expect(section.code).toContain("export function");
      expect(section.code).toContain("export default");
      expect(section.code).toContain("import '../App.css'");
    }
  });

  it("uses className instead of inline styles", () => {
    const root = makeNode({ id: "root", children: ["n1", "n2"] });
    const n1 = makeNode({ id: "n1", style: { color: "#1a1a2e" } });
    const n2 = makeNode({ id: "n2", style: { color: "#1a1a2e" } });

    const dsl = makeDSL([root, n1, n2]);
    const result = generateReactApp(dsl);

    // Section JSX should use className, not style={{}}
    const allCode = result.sections.map(s => s.code).join("\n");
    expect(allCode).toContain("className=");
    expect(allCode).not.toContain("style={{");
  });

  it("renders text nodes as <p> tags", () => {
    const root = makeNode({ id: "root", children: ["t1"] });
    const t1 = makeNode({ id: "t1", type: "text", content: { text: "Hello World" } });

    const dsl = makeDSL([root, t1]);
    const result = generateReactApp(dsl);

    const allCode = result.sections.map(s => s.code).join("\n");
    expect(allCode).toContain("<p");
    expect(allCode).toContain("Hello World");
  });

  it("renders image nodes with <img> tag and objectFit", () => {
    const root = makeNode({ id: "root", children: ["img1"] });
    const img1 = makeNode({ id: "img1", type: "image", content: { src: "http://example.com/img.png" } });

    const dsl = makeDSL([root, img1]);
    const result = generateReactApp(dsl);

    const allCode = result.sections.map(s => s.code).join("\n");
    expect(allCode).toContain("<img");
    expect(allCode).toContain("objectFit:");
  });

  it("handles flex layout in JSX", () => {
    const root = makeNode({ id: "root", children: ["flex1"] });
    const flex1 = makeNode({
      id: "flex1",
      layout: { mode: "flex", direction: "row", gap: 24, align: "center" },
      style: {},
    });
    const child1 = makeNode({ id: "c1" });
    const child2 = makeNode({ id: "c2" });
    flex1.children = ["c1", "c2"];

    const dsl = makeDSL([root, flex1, child1, child2]);
    const result = generateReactApp(dsl);

    // CSS should contain flex properties
    expect(result.appCSS).toContain("display:flex");
    expect(result.appCSS).toContain("flex-direction:row");
  });

  it("escapes special characters in text content", () => {
    const root = makeNode({ id: "root", children: ["t1"] });
    const t1 = makeNode({ id: "t1", type: "text", content: { text: "Use {brackets} & <tags>" } });

    const dsl = makeDSL([root, t1]);
    const result = generateReactApp(dsl);

    const allCode = result.sections.map(s => s.code).join("\n");
    expect(allCode).toContain("&amp;");
    expect(allCode).toContain("&lt;");
  });

  it("generates section names from English names", () => {
    const root = makeNode({ id: "root", children: ["s1", "s2", "s3"] });
    const s1 = makeNode({ id: "s1", name: "Hero Banner" });
    const s2 = makeNode({ id: "s2", name: "Features" });
    const s3 = makeNode({ id: "s3", name: "Footer" });

    const dsl = makeDSL([root, s1, s2, s3]);
    const result = generateReactApp(dsl);

    expect(result.sections[0].fileName).toBe("HeroBannerSection.tsx");
  });
});
