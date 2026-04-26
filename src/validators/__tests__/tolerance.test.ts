import { describe, it, expect } from "vitest";
import { classifySection, getTolerance, shouldReport } from "../tolerance.js";

describe("classifySection", () => {
  it("classifies text-only as text", () => {
    expect(classifySection(["text", "text"])).toBe("text");
  });

  it("classifies image-only as image", () => {
    expect(classifySection(["image"])).toBe("image");
  });

  it("classifies container-only as layout", () => {
    expect(classifySection(["container", "container"])).toBe("layout");
  });

  it("classifies mixed text+image as mixed", () => {
    expect(classifySection(["text", "image"])).toBe("mixed");
  });

  it("handles empty input as layout", () => {
    expect(classifySection([])).toBe("layout");
  });
});

describe("getTolerance", () => {
  it("text has lowest tolerance", () => {
    const t = getTolerance("text");
    expect(t.pixelThreshold).toBeLessThan(getTolerance("image").pixelThreshold);
    expect(t.pixelThreshold).toBeLessThan(getTolerance("layout").pixelThreshold);
  });

  it("image has highest tolerance", () => {
    const t = getTolerance("image");
    expect(t.pixelThreshold).toBeGreaterThan(getTolerance("text").pixelThreshold);
  });

  it("returns valid thresholds for all kinds", () => {
    for (const kind of ["text", "image", "layout", "mixed"] as const) {
      const t = getTolerance(kind);
      expect(t.pixelThreshold).toBeGreaterThan(0);
      expect(t.pixelThreshold).toBeLessThanOrEqual(1);
    }
  });
});

describe("shouldReport", () => {
  it("reports text diff above threshold", () => {
    expect(shouldReport(0.03, "text")).toBe(true);
    expect(shouldReport(0.01, "text")).toBe(false);
  });

  it("ignores image diff below threshold", () => {
    expect(shouldReport(0.10, "image")).toBe(false);
    expect(shouldReport(0.20, "image")).toBe(true);
  });

  it("supports different metrics", () => {
    expect(shouldReport(0.04, "text", "color")).toBe(true);
    expect(shouldReport(0.02, "text", "color")).toBe(false);
  });
});
