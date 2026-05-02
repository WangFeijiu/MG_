import { describe, it, expect } from "vitest";
import { deepMerge, applyPatches, generatePatchId } from "../patch.js";
import type { MachineDSL, DSLNode } from "../../types/machine-dsl.js";
import type { PatchDocument } from "../../types/patch.js";

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

function makeDSL(nodes: DSLNode[]): MachineDSL {
  return {
    page: { id: "page-1", name: "Page", width: 1440, height: 1000 },
    nodes,
  };
}

function makePatchDoc(patches: PatchDocument["patches"]): PatchDocument {
  return { version: 1, patches };
}

describe("deepMerge", () => {
  it("merges flat properties from source into target", () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 } as any);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("recursively merges nested objects", () => {
    const target = { style: { color: "red", fontSize: 14 } };
    const source = { style: { color: "blue" } };
    const result = deepMerge(target, source as any);
    expect(result.style.color).toBe("blue");
    expect(result.style.fontSize).toBe(14);
  });

  it("replaces arrays entirely", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source as any);
    expect(result.items).toEqual([4, 5]);
  });

  it("overwrites target with null values from source", () => {
    const target = { a: "hello", b: "world" };
    const source = { a: null };
    const result = deepMerge(target, source as any);
    expect(result.a).toBeNull();
    expect(result.b).toBe("world");
  });

  it("does not mutate the original target object", () => {
    const target = { style: { color: "red" } };
    const original = { ...target, style: { ...target.style } };
    deepMerge(target, { style: { color: "blue" } } as any);
    expect(target.style.color).toBe("red");
  });

  it("returns copy of target when source is empty", () => {
    const target = { a: 1, b: { c: 2 } };
    const result = deepMerge(target, {} as any);
    expect(result).toEqual(target);
    expect(result).not.toBe(target);
  });

  it("adds new keys from source not present in target", () => {
    const result = deepMerge({ a: 1 }, { b: 2 } as any);
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

describe("applyPatches", () => {
  it("applies update_style patch to matching node", () => {
    const dsl = makeDSL([makeNode({ id: "n1", style: { color: "red" } })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_style", payload: { color: "blue" } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].style.color).toBe("blue");
  });

  it("applies update_layout patch to matching node", () => {
    const dsl = makeDSL([makeNode({ id: "n1", layout: { width: 100, height: 50 } })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_layout", payload: { width: 200 } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].layout.width).toBe(200);
    expect(result.nodes[0].layout.height).toBe(50);
  });

  it("applies update_content patch to matching node", () => {
    const dsl = makeDSL([makeNode({ id: "n1", content: { text: "old" } })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_content", payload: { text: "new" } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].content?.text).toBe("new");
  });

  it("applies update_content when node has no existing content", () => {
    const dsl = makeDSL([makeNode({ id: "n1" })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_content", payload: { text: "hello" } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].content?.text).toBe("hello");
  });

  it("applies multiple patches sequentially", () => {
    const dsl = makeDSL([
      makeNode({ id: "n1", style: { color: "red" } }),
      makeNode({ id: "n2", style: { fontSize: 14 } }),
    ]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_style", payload: { color: "blue" } },
      { id: "p2", targetNodeId: "n2", op: "update_style", payload: { fontSize: 18 } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].style.color).toBe("blue");
    expect(result.nodes[1].style.fontSize).toBe(18);
  });

  it("skips patch when targetNodeId is not found", () => {
    const dsl = makeDSL([makeNode({ id: "n1", style: { color: "red" } })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "nonexistent", op: "update_style", payload: { color: "blue" } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].style.color).toBe("red");
  });

  it("does not mutate the original DSL", () => {
    const dsl = makeDSL([makeNode({ id: "n1", style: { color: "red" } })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_style", payload: { color: "blue" } },
    ]);
    applyPatches(dsl, doc);
    expect(dsl.nodes[0].style.color).toBe("red");
  });

  it("returns deep copy when patches array is empty", () => {
    const dsl = makeDSL([makeNode({ id: "n1" })]);
    const doc = makePatchDoc([]);
    const result = applyPatches(dsl, doc);
    expect(result).toEqual(dsl);
    expect(result).not.toBe(dsl);
    expect(result.nodes[0]).not.toBe(dsl.nodes[0]);
  });

  it("deep-merges style properties preserving unpatched fields", () => {
    const dsl = makeDSL([makeNode({ id: "n1", style: { color: "red", fontSize: 14, fontWeight: 700 } })]);
    const doc = makePatchDoc([
      { id: "p1", targetNodeId: "n1", op: "update_style", payload: { color: "blue" } },
    ]);
    const result = applyPatches(dsl, doc);
    expect(result.nodes[0].style.color).toBe("blue");
    expect(result.nodes[0].style.fontSize).toBe(14);
    expect(result.nodes[0].style.fontWeight).toBe(700);
  });
});

describe("generatePatchId", () => {
  it("returns a string starting with patch_", () => {
    const id = generatePatchId();
    expect(id.startsWith("patch_")).toBe(true);
  });

  it("generates unique IDs on consecutive calls", () => {
    const id1 = generatePatchId();
    const id2 = generatePatchId();
    expect(id1).not.toBe(id2);
  });
});
