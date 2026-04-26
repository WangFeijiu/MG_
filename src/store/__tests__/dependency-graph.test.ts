import { describe, it, expect } from "vitest";
import {
  buildDependencyGraph,
  getAffectedSections,
  topologicalSort,
} from "../dependency-graph.js";
import type { Section } from "../../generators/section-splitter.js";
import type { DSLNode } from "../../types/machine-dsl.js";

function makeNode(overrides: Partial<DSLNode> = {}): DSLNode {
  return {
    id: "n1",
    type: "container",
    parentId: null,
    children: [],
    layout: {},
    style: {},
    ...overrides,
  };
}

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: "s1",
    name: "Test",
    nodeId: "n1",
    nodeIds: ["n1"],
    complexity: 0,
    ...overrides,
  };
}

describe("buildDependencyGraph", () => {
  it("builds graph with no dependencies for independent sections", () => {
    const sections = [
      makeSection({ id: "s1", nodeId: "n1", nodeIds: ["n1"] }),
      makeSection({ id: "s2", nodeId: "n2", nodeIds: ["n2"] }),
      makeSection({ id: "s3", nodeId: "n3", nodeIds: ["n3"] }),
    ];
    const nodeMap = new Map<string, DSLNode>();
    nodeMap.set("n1", makeNode({ id: "n1" }));
    nodeMap.set("n2", makeNode({ id: "n2" }));
    nodeMap.set("n3", makeNode({ id: "n3" }));

    const graph = buildDependencyGraph(sections, nodeMap);
    expect(graph.sections.get("s1")!.size).toBe(0);
    expect(graph.sections.get("s2")!.size).toBe(0);
    expect(graph.sections.get("s3")!.size).toBe(0);
  });

  it("detects cross-section parent-child dependency", () => {
    const sections = [
      makeSection({ id: "s1", nodeId: "n1", nodeIds: ["n1", "n2"] }),
      makeSection({ id: "s2", nodeId: "n3", nodeIds: ["n3"] }),
    ];
    const nodeMap = new Map<string, DSLNode>();
    nodeMap.set("n1", makeNode({ id: "n1", children: ["n2"] }));
    nodeMap.set("n2", makeNode({ id: "n2", parentId: "n1" }));
    nodeMap.set("n3", makeNode({ id: "n3" }));

    const graph = buildDependencyGraph(sections, nodeMap);
    // n2 in s1 has parentId n1 also in s1 — no cross-section dep
    expect(graph.sections.get("s1")!.size).toBe(0);
  });

  it("detects dependency when node parent is in different section", () => {
    const sections = [
      makeSection({ id: "s1", nodeId: "n1", nodeIds: ["n1"] }),
      makeSection({ id: "s2", nodeId: "n2", nodeIds: ["n2"] }),
    ];
    const nodeMap = new Map<string, DSLNode>();
    nodeMap.set("n1", makeNode({ id: "n1", children: ["n2"] }));
    nodeMap.set("n2", makeNode({ id: "n2", parentId: "n1" }));

    const graph = buildDependencyGraph(sections, nodeMap);
    expect(graph.sections.get("s2")!.has("s1")).toBe(true);
    expect(graph.reverseDeps.get("s1")!.has("s2")).toBe(true);
  });
});

describe("topologicalSort", () => {
  it("returns sections in dependency order", () => {
    const graph: import("../dependency-graph.js").DependencyGraph = {
      sections: new Map([
        ["s1", new Set()],
        ["s2", new Set(["s1"])],
        ["s3", new Set(["s2"])],
      ]),
      reverseDeps: new Map([
        ["s1", new Set(["s2"])],
        ["s2", new Set(["s3"])],
        ["s3", new Set()],
      ]),
    };

    const result = topologicalSort(["s1", "s2", "s3"], graph);
    expect(result.indexOf("s1")).toBeLessThan(result.indexOf("s2"));
    expect(result.indexOf("s2")).toBeLessThan(result.indexOf("s3"));
  });

  it("handles independent sections", () => {
    const graph: import("../dependency-graph.js").DependencyGraph = {
      sections: new Map([
        ["s1", new Set()],
        ["s2", new Set()],
        ["s3", new Set()],
      ]),
      reverseDeps: new Map([
        ["s1", new Set()],
        ["s2", new Set()],
        ["s3", new Set()],
      ]),
    };

    const result = topologicalSort(["s1", "s2", "s3"], graph);
    expect(result.sort()).toEqual(["s1", "s2", "s3"]);
  });
});

describe("getAffectedSections", () => {
  it("finds directly and transitively affected sections", () => {
    const graph: import("../dependency-graph.js").DependencyGraph = {
      sections: new Map([
        ["s1", new Set()],
        ["s2", new Set(["s1"])],
        ["s3", new Set(["s2"])],
      ]),
      reverseDeps: new Map([
        ["s1", new Set(["s2"])],
        ["s2", new Set(["s3"])],
        ["s3", new Set()],
      ]),
    };

    const affected = getAffectedSections(["s1"], graph);
    expect(affected).toContain("s1");
    expect(affected).toContain("s2");
    expect(affected).toContain("s3");
    expect(affected.length).toBe(3);
  });

  it("only returns reachable sections", () => {
    const graph: import("../dependency-graph.js").DependencyGraph = {
      sections: new Map([
        ["s1", new Set()],
        ["s2", new Set()],
        ["s3", new Set(["s2"])],
      ]),
      reverseDeps: new Map([
        ["s1", new Set()],
        ["s2", new Set(["s3"])],
        ["s3", new Set()],
      ]),
    };

    const affected = getAffectedSections(["s1"], graph);
    expect(affected).toEqual(["s1"]);
  });

  it("handles multiple changed sections", () => {
    const graph: import("../dependency-graph.js").DependencyGraph = {
      sections: new Map([
        ["s1", new Set()],
        ["s2", new Set()],
        ["s3", new Set(["s1", "s2"])],
      ]),
      reverseDeps: new Map([
        ["s1", new Set(["s3"])],
        ["s2", new Set(["s3"])],
        ["s3", new Set()],
      ]),
    };

    const affected = getAffectedSections(["s1", "s2"], graph);
    expect(affected.sort()).toEqual(["s1", "s2", "s3"]);
  });
});
