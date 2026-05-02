import { describe, it, expect } from "vitest";
import { escapeHTML, escapeAttr, getHTMLTag, filterCoveredClasses } from "../html-preview.js";
import type { DSLNode } from "../../types/machine-dsl.js";
import type { CSSClassMap } from "../css-optimizer.js";

function makeNode(overrides: Partial<DSLNode> = {}): DSLNode {
  return {
    id: "node-1",
    type: "container",
    name: "Node",
    parentId: null,
    children: [],
    layout: {},
    style: {},
    ...overrides,
  } as DSLNode;
}

function makeClassMap(
  classes: [string, string][],
  nodeClasses: [string, string[]][],
): CSSClassMap {
  return {
    classes: new Map(classes),
    nodeClasses: new Map(nodeClasses),
    nodeInlineStyles: new Map(),
  };
}

describe("escapeHTML", () => {
  it("escapes ampersands", () => {
    expect(escapeHTML("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHTML("<div>")).toBe("&lt;div&gt;");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHTML("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeHTML("")).toBe("");
  });
});

describe("escapeAttr", () => {
  it("escapes double quotes", () => {
    expect(escapeAttr('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes ampersands and angle brackets", () => {
    expect(escapeAttr("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });

  it("returns plain text unchanged", () => {
    expect(escapeAttr("hello")).toBe("hello");
  });
});

describe("getHTMLTag", () => {
  it("returns button for button type", () => {
    expect(getHTMLTag(makeNode({ type: "button" }))).toBe("button");
  });

  it("returns p for text type", () => {
    expect(getHTMLTag(makeNode({ type: "text" }))).toBe("p");
  });

  it("returns div for container type", () => {
    expect(getHTMLTag(makeNode({ type: "container" }))).toBe("div");
  });

  it("returns div for image type", () => {
    expect(getHTMLTag(makeNode({ type: "image" }))).toBe("div");
  });

  it("returns div for icon type", () => {
    expect(getHTMLTag(makeNode({ type: "icon" }))).toBe("div");
  });
});

describe("filterCoveredClasses", () => {
  it("excludes classes used only by covered nodes", () => {
    const classMap = makeClassMap(
      [["cls-a", "color: red"]],
      [["n1", ["cls-a"]]],
    );
    const covered = new Set(["n1"]);
    const result = filterCoveredClasses(classMap, covered);
    expect(result).toBe("");
  });

  it("keeps classes used by at least one uncovered node", () => {
    const classMap = makeClassMap(
      [["cls-a", "color: red"]],
      [["n1", ["cls-a"]], ["n2", ["cls-a"]]],
    );
    const covered = new Set(["n1"]);
    const result = filterCoveredClasses(classMap, covered);
    expect(result).toContain("cls-a");
    expect(result).toContain("color: red");
  });

  it("returns empty string when all classes are covered", () => {
    const classMap = makeClassMap(
      [["cls-a", "color: red"], ["cls-b", "font-size: 14px"]],
      [["n1", ["cls-a", "cls-b"]]],
    );
    const covered = new Set(["n1"]);
    const result = filterCoveredClasses(classMap, covered);
    expect(result).toBe("");
  });

  it("returns all classes when no nodes are covered", () => {
    const classMap = makeClassMap(
      [["cls-a", "color: red"], ["cls-b", "font-size: 14px"]],
      [["n1", ["cls-a"]], ["n2", ["cls-b"]]],
    );
    const covered = new Set<string>();
    const result = filterCoveredClasses(classMap, covered);
    expect(result).toContain("cls-a");
    expect(result).toContain("cls-b");
  });
});
