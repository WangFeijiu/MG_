import { describe, it, expect } from "vitest";
import { applyPatchesToDSL, incrementalRegenerate } from "../incremental-update.js";
import type { MachineDSL, DSLNode } from "../../types/machine-dsl.js";

function makeDSL(): MachineDSL {
  const root: DSLNode = {
    id: "root", type: "container", parentId: null, children: ["s1", "s2", "s3"],
    layout: { width: 1440 }, style: {},
  };
  const s1: DSLNode = {
    id: "s1", type: "container", parentId: "root", children: ["t1"],
    layout: { width: 1440 }, style: { background: "#fff" }, name: "Hero",
  };
  const s2: DSLNode = {
    id: "s2", type: "container", parentId: "root", children: [],
    layout: { width: 1440 }, style: { background: "#fff" },
  };
  const s3: DSLNode = {
    id: "s3", type: "container", parentId: "root", children: [],
    layout: { width: 1440 }, style: { background: "#fff" },
  };
  const t1: DSLNode = {
    id: "t1", type: "text", parentId: "s1", children: [],
    layout: {}, style: { color: "#000" },
    content: { text: "Hello" },
  };
  return {
    page: { id: "root", name: "Test", width: 1440, height: 1000 },
    nodes: [root, s1, s2, s3, t1],
  };
}

describe("applyPatchesToDSL", () => {
  it("applies updateStyle patch", () => {
    const dsl = makeDSL();
    const patched = applyPatchesToDSL(dsl, [
      { targetNodeId: "s1", op: "updateStyle", payload: { color: "red" } },
    ]);
    const s1 = patched.nodes.find(n => n.id === "s1")!;
    expect(s1.style.color).toBe("red");
  });

  it("applies updateLayout patch", () => {
    const dsl = makeDSL();
    const patched = applyPatchesToDSL(dsl, [
      { targetNodeId: "s1", op: "updateLayout", payload: { width: 800 } },
    ]);
    const s1 = patched.nodes.find(n => n.id === "s1")!;
    expect(s1.layout.width).toBe(800);
  });

  it("applies updateContent patch", () => {
    const dsl = makeDSL();
    const patched = applyPatchesToDSL(dsl, [
      { targetNodeId: "t1", op: "updateContent", payload: { text: "World" } },
    ]);
    const t1 = patched.nodes.find(n => n.id === "t1")!;
    expect(t1.content?.text).toBe("World");
  });

  it("ignores patches for non-existent nodes", () => {
    const dsl = makeDSL();
    const patched = applyPatchesToDSL(dsl, [
      { targetNodeId: "nonexistent", op: "updateStyle", payload: { color: "red" } },
    ]);
    expect(patched.nodes).toHaveLength(dsl.nodes.length);
  });
});

describe("incrementalRegenerate", () => {
  it("regenerates affected sections and skips others", async () => {
    const dsl = makeDSL();
    const result = await incrementalRegenerate(dsl, [
      { targetNodeId: "t1", op: "updateContent", payload: { text: "Changed" } },
    ], null);

    expect(result.regeneratedSections.length).toBeGreaterThanOrEqual(1);
    expect(result.reactOutput).toBeDefined();
    expect(result.reactOutput.sections.length).toBeGreaterThanOrEqual(1);
  });

  it("handles multiple patches", async () => {
    const dsl = makeDSL();
    const result = await incrementalRegenerate(dsl, [
      { targetNodeId: "s1", op: "updateStyle", payload: { background: "blue" } },
      { targetNodeId: "s2", op: "updateStyle", payload: { background: "green" } },
    ], null);

    expect(result.reactOutput).toBeDefined();
  });

  it("works without previous output", async () => {
    const dsl = makeDSL();
    const result = await incrementalRegenerate(dsl, [], null);
    expect(result.reactOutput.sections.length).toBeGreaterThanOrEqual(1);
  });
});
