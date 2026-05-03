/**
 * 截图 + 像素对比工具函数
 *
 * 从 src/validators/validation-pipeline.ts 提取的独立实现，
 * 不依赖原文件（原文件中这些函数是私有的）。
 */

import puppeteer, { type Browser } from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs/browser.js";
import { writeFileSync } from "node:fs";

// ========== PNG 工具 ==========

export function padPNG(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstIdx = (width * y + x) << 2;
      out.data[dstIdx] = src.data[srcIdx];
      out.data[dstIdx + 1] = src.data[srcIdx + 1];
      out.data[dstIdx + 2] = src.data[srcIdx + 2];
      out.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return out;
}

export function cropPNG(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const cx = Math.max(0, Math.round(x));
  const cy = Math.max(0, Math.round(y));
  const cw = Math.min(Math.round(w), src.width - cx);
  const ch = Math.min(Math.round(h), src.height - cy);
  if (cw <= 0 || ch <= 0) return new PNG({ width: 1, height: 1 });

  const out = new PNG({ width: cw, height: ch });
  for (let row = 0; row < ch; row++) {
    const srcOffset = ((cy + row) * src.width + cx) << 2;
    src.data.copy(out.data, row * cw * 4, srcOffset, srcOffset + cw * 4);
  }
  return out;
}

export function savePNG(png: PNG, filePath: string): void {
  const buffer = PNG.sync.write(png);
  writeFileSync(filePath, buffer);
}

// ========== 像素对比 ==========

export type DiffAnalysis = {
  diffPercent: number;
  areas: Array<{ x: number; y: number; width: number; height: number }>;
  features: string[];
  diffPNG: PNG;
};

export function comparePNGs(a: PNG, b: PNG): DiffAnalysis {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const paddedA = padPNG(a, width, height);
  const paddedB = padPNG(b, width, height);

  // pixelmatch 写入临时 buffer（纯红标记差异像素）
  const tmpDiff = new PNG({ width, height });
  const diffPixels = pixelmatch(paddedA.data, paddedB.data, tmpDiff.data, width, height, { threshold: 0.1, alpha: 0 });

  // 以生成截图为底图，差异像素用红色半透明混合 (70% 红 + 30% 原色)
  const diff = new PNG({ width, height });
  paddedA.data.copy(diff.data);
  for (let i = 0; i < tmpDiff.data.length; i += 4) {
    if (tmpDiff.data[i] === 255 && tmpDiff.data[i + 1] === 0 && tmpDiff.data[i + 2] === 0) {
      diff.data[i]     = Math.round(255 * 0.7 + paddedA.data[i] * 0.3);     // R
      diff.data[i + 1] = Math.round(0   * 0.7 + paddedA.data[i + 1] * 0.3); // G
      diff.data[i + 2] = Math.round(0   * 0.7 + paddedA.data[i + 2] * 0.3); // B
    }
  }

  const areas = extractDiffAreas(tmpDiff, width, height);
  const features = analyzeDiffFeatures(tmpDiff, paddedA, paddedB, width, height);

  return {
    diffPercent: diffPixels / (width * height),
    areas,
    features,
    diffPNG: diff,
  };
}

function extractDiffAreas(
  diff: PNG,
  width: number,
  height: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  const visited = new Set<string>();
  const regions: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (diff.data[idx] !== 255 || diff.data[idx + 1] !== 0 || diff.data[idx + 2] !== 0) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      let x1 = x, y1 = y, x2 = x, y2 = y;
      const queue = [{ x, y }];
      visited.add(key);

      while (queue.length > 0) {
        const p = queue.shift()!;
        x1 = Math.min(x1, p.x);
        y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x);
        y2 = Math.max(y2, p.y);

        for (const n of [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }]) {
          const nKey = `${n.x},${n.y}`;
          if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height && !visited.has(nKey)) {
            const nIdx = (width * n.y + n.x) << 2;
            if (diff.data[nIdx] === 255 && diff.data[nIdx + 1] === 0 && diff.data[nIdx + 2] === 0) {
              visited.add(nKey);
              queue.push(n);
            }
          }
        }
      }
      regions.push({ x1, y1, x2, y2 });
    }
  }

  const merged = mergeNearbyRegions(regions, 50);
  return merged.map(r => ({ x: r.x1, y: r.y1, width: r.x2 - r.x1 + 1, height: r.y2 - r.y1 + 1 }));
}

function mergeNearbyRegions(
  regions: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  threshold: number,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  if (regions.length <= 1) return regions;
  const result = [...regions];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i], b = result[j];
        const dist = Math.min(
          Math.abs(a.x2 - b.x1), Math.abs(b.x2 - a.x1),
          Math.abs(a.y2 - b.y1), Math.abs(b.y2 - a.y1),
        );
        if (dist <= threshold) {
          result[i] = { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
          result.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return result;
}

function analyzeDiffFeatures(diff: PNG, a: PNG, b: PNG, width: number, height: number): string[] {
  const features = new Set<string>();
  let colorDiffCount = 0;
  let structuralDiffCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (diff.data[idx] !== 255 || diff.data[idx + 1] !== 0 || diff.data[idx + 2] !== 0) continue;
      const aAlpha = a.data[idx + 3], bAlpha = b.data[idx + 3];
      if ((aAlpha > 10 && bAlpha > 10) || (aAlpha <= 10 && bAlpha <= 10)) {
        colorDiffCount++;
      } else {
        structuralDiffCount++;
      }
    }
  }

  if (structuralDiffCount > colorDiffCount) {
    features.add("布局差异（元素缺失或多余）");
  } else {
    features.add("颜色/样式差异（结构相同，外观不同）");
  }
  if (colorDiffCount > width * height * 0.05) {
    features.add("大范围颜色差异（背景或主题不匹配）");
  }
  if (structuralDiffCount > width * height * 0.01) {
    features.add("显著结构变化（元素移位或缺失）");
  }

  return Array.from(features);
}

// ========== Puppeteer 截图 ==========

export async function screenshotFullPage(browser: Browser, html: string, width: number): Promise<PNG> {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const screenshot = await page.screenshot({ type: "png", fullPage: true }) as Buffer;
  await page.close();
  return PNG.sync.read(screenshot);
}

// ========== Section Y 坐标计算 ==========

export function getSectionYBounds(
  sections: Array<{ id: string; nodeId: string }>,
  nodeMap: Map<string, { layout: { y?: number; height?: number } }>,
): Map<string, { y: number; height: number }> {
  const bounds = new Map<string, { y: number; height: number }>();
  for (const section of sections) {
    const root = nodeMap.get(section.nodeId);
    if (!root) continue;
    bounds.set(section.id, {
      y: root.layout.y ?? 0,
      height: typeof root.layout.height === "number" ? root.layout.height : 400,
    });
  }
  return bounds;
}
