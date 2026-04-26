import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../in-memory-store.js";
import type { MachineDSL, DSLNode } from "../../types/machine-dsl.js";

function makeDSL(): MachineDSL {
  return {
    page: { id: "root", name: "Test", width: 1440, height: 1000 },
    nodes: [
      {
        id: "root",
        type: "container",
        parentId: null,
        children: [],
        layout: {},
        style: {},
      },
    ],
  };
}

describe("InMemoryStore", () => {
  it("starts with empty state", () => {
    const store = new InMemoryStore();
    expect(store.getDSL()).toBeNull();
    expect(store.getSections()).toEqual([]);
    expect(store.getTokens()).toBeNull();
    expect(store.getReactOutput()).toBeNull();
    expect(store.getPatches()).toEqual([]);
  });

  it("stores and retrieves DSL", () => {
    const store = new InMemoryStore();
    const dsl = makeDSL();
    store.setDSL(dsl);
    expect(store.getDSL()).toBe(dsl);
  });

  it("stores and retrieves sections", () => {
    const store = new InMemoryStore();
    const sections = [
      { id: "s1", name: "Hero", nodeId: "n1", nodeIds: ["n1"], complexity: 5 },
    ];
    store.setSections(sections);
    expect(store.getSections()).toEqual(sections);
  });

  it("stores and retrieves tokens", () => {
    const store = new InMemoryStore();
    const tokens = {
      colors: { items: [], lookup: new Map() },
      fonts: { items: [], lookup: new Map() },
      spacings: { items: [], lookup: new Map() },
      radii: { items: [], lookup: new Map() },
      shadows: { items: [], lookup: new Map() },
    };
    store.setTokens(tokens);
    expect(store.getTokens()).toBe(tokens);
  });

  it("stores and retrieves React output", () => {
    const store = new InMemoryStore();
    const output = {
      appTSX: "import React...",
      appCSS: ":root {}",
      sections: [{ fileName: "Hero.tsx", code: "export function Hero() {}" }],
    };
    store.setReactOutput(output);
    expect(store.getReactOutput()).toEqual(output);
  });

  it("manages patches (add, get, clear)", () => {
    const store = new InMemoryStore();
    const patch = {
      id: "p1",
      targetNodeId: "n1",
      op: "updateStyle",
      payload: { color: "red" },
      appliedAt: new Date().toISOString(),
    };

    store.addPatch(patch);
    expect(store.getPatches()).toHaveLength(1);
    expect(store.getPatches()[0].targetNodeId).toBe("n1");

    store.addPatch({ ...patch, id: "p2", targetNodeId: "n2" });
    expect(store.getPatches()).toHaveLength(2);

    store.clearPatches();
    expect(store.getPatches()).toHaveLength(0);
  });

  it("reset() clears all data", () => {
    const store = new InMemoryStore();
    store.setDSL(makeDSL());
    store.setSections([{ id: "s1", name: "A", nodeId: "n1", nodeIds: ["n1"], complexity: 0 }]);
    store.addPatch({
      id: "p1",
      targetNodeId: "n1",
      op: "updateStyle",
      payload: {},
      appliedAt: "",
    });

    store.reset();

    expect(store.getDSL()).toBeNull();
    expect(store.getSections()).toEqual([]);
    expect(store.getPatches()).toEqual([]);
  });

  it("getSnapshot returns readonly snapshot", () => {
    const store = new InMemoryStore();
    store.setDSL(makeDSL());
    const snap = store.getSnapshot();
    expect(snap.dsl).not.toBeNull();
    expect(snap.sections).toEqual([]);
  });

  it("onChange fires on mutations and unsubscribe works", () => {
    const store = new InMemoryStore();
    const changes: unknown[] = [];
    const unsub = store.onChange((data) => changes.push(data));

    store.setDSL(makeDSL());
    expect(changes).toHaveLength(1);

    store.reset();
    expect(changes).toHaveLength(2);

    unsub();
    store.setDSL(makeDSL());
    expect(changes).toHaveLength(2);
  });
});
