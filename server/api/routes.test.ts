import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import { createAPIRouter } from "../api/routes.js";
import { InMemoryStore } from "../../src/store/in-memory-store.js";
import type { MachineDSL, DSLNode } from "../../src/types/machine-dsl.js";
import type { Request, Response } from "express";

function makeDSL(): MachineDSL {
  const root: DSLNode = {
    id: "root", type: "container", parentId: null, children: ["s1", "s2", "s3"],
    layout: { width: 1440 }, style: {},
  };
  const s1: DSLNode = {
    id: "s1", type: "container", parentId: "root", children: [],
    layout: { width: 1440 }, style: { background: "#fff" },
  };
  const s2: DSLNode = {
    id: "s2", type: "container", parentId: "root", children: [],
    layout: { width: 1440 }, style: { background: "#fff" },
  };
  const s3: DSLNode = {
    id: "s3", type: "container", parentId: "root", children: [],
    layout: { width: 1440 }, style: { background: "#fff" },
  };
  return {
    page: { id: "root", name: "Test Page", width: 1440, height: 1000 },
    nodes: [root, s1, s2, s3],
  };
}

function mockRes(): Response {
  const res = {
    statusCode: 200,
    body: null as any,
    json(data: any) { res.body = data; return res; },
    status(code: number) { res.statusCode = code; return res; },
  } as unknown as Response;
  return res;
}

describe("API Routes", () => {
  let store: InMemoryStore;
  let router: express.Router;

  beforeEach(() => {
    store = new InMemoryStore();
    router = createAPIRouter(store);
  });

  it("POST /dsl — accepts valid DSL", () => {
    const req = { body: makeDSL() } as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/dsl")?.route?.stack?.[0]?.handle;
    expect(handler).toBeDefined();
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body.stats.sectionCount).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.nodeCount).toBe(4);
    expect(store.getDSL()).not.toBeNull();
  });

  it("POST /dsl — rejects invalid DSL", () => {
    const req = { body: { foo: "bar" } } as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/dsl")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("Invalid DSL");
  });

  it("POST /generate — generates code after DSL upload", () => {
    store.setDSL(makeDSL());

    const req = { body: {} } as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/generate")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body.reactOutput.sectionCount).toBeGreaterThanOrEqual(1);
    expect(res.body.files["App.tsx"]).toBeDefined();
    expect(store.getReactOutput()).not.toBeNull();
  });

  it("POST /generate — rejects without DSL", () => {
    const req = { body: {} } as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/generate")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("No DSL");
  });

  it("GET /status — returns current state", () => {
    store.setDSL(makeDSL());

    const req = {} as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/status")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body.hasDSL).toBe(true);
    expect(res.body.sectionCount).toBeGreaterThanOrEqual(0);
  });

  it("POST /patch — applies a patch", () => {
    store.setDSL(makeDSL());

    const req = {
      body: { targetNodeId: "s1", op: "updateStyle", payload: { color: "red" } },
    } as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/patch")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(store.getPatches()).toHaveLength(1);
  });

  it("POST /patch — rejects missing fields", () => {
    const req = { body: { targetNodeId: "s1" } } as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/patch")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(400);
  });

  it("POST /reset — clears all data", () => {
    store.setDSL(makeDSL());

    const req = {} as Request;
    const res = mockRes();

    const handler = router.stack.find(l => l.route?.path === "/reset")?.route?.stack?.[0]?.handle;
    handler!(req, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body.reset).toBe(true);
    expect(store.getDSL()).toBeNull();
  });
});
