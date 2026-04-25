import { describe, it, expect } from "vitest";
import { splitSections } from "../section-splitter";
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

function makeDSL(nodes: DSLNode[], rootOverrides: Partial<DSLNode> = {}): MachineDSL {
  const rootId = rootOverrides.id || "root";
  return {
    page: { id: rootId, name: "Test", width: 1440, height: 1000 },
    nodes,
  };
}

describe("splitSections", () => {
  it("returns single section for empty root", () => {
    const root = makeNode({ id: "root", name: "Page" });
    const dsl = makeDSL([root]);

    const sections = splitSections(dsl);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Page");
  });

  it("identifies sections from root children when enough exist", () => {
    const root = makeNode({ id: "root", children: ["s1", "s2", "s3"] });
    const s1 = makeNode({ id: "s1", name: "Hero", layout: { width: 1440 }, children: [] });
    const s2 = makeNode({ id: "s2", name: "Features", layout: { width: 1440 }, children: [] });
    const s3 = makeNode({ id: "s3", name: "Footer", layout: { width: 1440 }, children: [] });

    const dsl = makeDSL([root, s1, s2, s3]);

    const sections = splitSections(dsl);
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe("Hero");
    expect(sections[1].name).toBe("Features");
    expect(sections[2].name).toBe("Footer");
  });

  it("drills deeper when root has too few children", () => {
    // Root → 1 child → 4 grandchildren (should find the 4 grandchildren)
    const root = makeNode({ id: "root", children: ["wrapper"] });
    const wrapper = makeNode({ id: "wrapper", children: ["gc1", "gc2", "gc3", "gc4"] });
    const gc1 = makeNode({ id: "gc1", name: "Section A" });
    const gc2 = makeNode({ id: "gc2", name: "Section B" });
    const gc3 = makeNode({ id: "gc3", name: "Section C" });
    const gc4 = makeNode({ id: "gc4", name: "Section D" });

    const dsl = makeDSL([root, wrapper, gc1, gc2, gc3, gc4]);

    const sections = splitSections(dsl);
    expect(sections).toHaveLength(4);
    expect(sections.map(s => s.name)).toEqual(["Section A", "Section B", "Section C", "Section D"]);
  });

  it("includes all descendant nodeIds in each section", () => {
    const root = makeNode({ id: "root", children: ["s1", "s2", "s3"] });
    const s1 = makeNode({ id: "s1", children: ["c1"] });
    const c1 = makeNode({ id: "c1" });
    const s2 = makeNode({ id: "s2", children: [] });
    const s3 = makeNode({ id: "s3", children: [] });

    const dsl = makeDSL([root, s1, c1, s2, s3]);

    const sections = splitSections(dsl);
    // s1 should include itself + c1
    expect(sections[0].nodeIds).toContain("s1");
    expect(sections[0].nodeIds).toContain("c1");
  });

  it("computes complexity score", () => {
    const root = makeNode({ id: "root", children: ["s1", "s2", "s3"] });
    const s1 = makeNode({ id: "s1", type: "button", style: { color: "red" } });
    const s2 = makeNode({ id: "s2" });
    const s3 = makeNode({ id: "s3" });

    const dsl = makeDSL([root, s1, s2, s3]);

    const sections = splitSections(dsl);
    // Button section should have higher complexity
    expect(sections[0].complexity).toBeGreaterThan(0);
  });
});
