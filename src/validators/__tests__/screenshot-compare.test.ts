import { describe, it, expect } from "vitest";
import { comparePixelBuffers } from "../screenshot-compare.js";

describe("comparePixelBuffers", () => {
  it("returns 0 diff for identical images", () => {
    const size = 10 * 10;
    const img = Buffer.alloc(size * 4, 128);
    const result = comparePixelBuffers(img, img, 10, 10);
    expect(result.diffPercent).toBe(0);
    expect(result.diffPixels).toBe(0);
  });

  it("detects single pixel difference", () => {
    const size = 10 * 10;
    const imgA = Buffer.alloc(size * 4, 255);
    const imgB = Buffer.alloc(size * 4, 255);
    imgB[0] = 0;
    const result = comparePixelBuffers(imgA, imgB, 10, 10);
    expect(result.diffPixels).toBeGreaterThanOrEqual(1);
    expect(result.diffPercent).toBeGreaterThan(0);
  });

  it("detects high diff for completely different images", () => {
    const size = 10 * 10;
    const imgA = Buffer.alloc(size * 4, 0);
    const imgB = Buffer.alloc(size * 4, 255);
    const result = comparePixelBuffers(imgA, imgB, 10, 10);
    expect(result.diffPercent).toBeGreaterThan(0.5);
  });
});
