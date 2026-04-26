/**
 * 截图对比
 * 渲染 HTML → 截图 → 像素对比 → 差异报告
 */

import pixelmatch from "pixelmatch";

export type ScreenshotDiff = {
  sectionId: string;
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
};

export function comparePixelBuffers(
  actual: Buffer,
  expected: Buffer,
  width: number,
  height: number,
  threshold = 0.1,
): { diffPercent: number; diffPixels: number } {
  const totalPixels = width * height;
  const diff = Buffer.alloc(totalPixels * 4);
  const diffPixels = pixelmatch(actual, expected, diff, width, height, { threshold });
  return { diffPercent: diffPixels / totalPixels, diffPixels };
}
