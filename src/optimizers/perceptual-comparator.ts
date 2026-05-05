/**
 * 感知式截图对比引擎（v2 — Lab Delta E + 区域色彩容差）
 *
 * 核心指标：
 *   区域内 85% 像素和目标色 Delta E <= 5 → 颜色还原通过
 *
 * 三个关键设计：
 * 1. RGB → Lab 色彩空间 + CIE76 Delta E（人眼感知色差）
 *    DeltaE < 1  几乎看不出来
 *    DeltaE 1-3  轻微差异
 *    DeltaE 3-6  可接受差异
 *    DeltaE 6-10 明显但可能还能接受
 *    DeltaE > 10 差异较大
 * 2. 不比平均色（会被阴影/边缘污染），而是统计区域内每个像素的 Delta E 分布
 *    85% 像素 DeltaE <= 5 && 平均 DeltaE <= 5 → 通过
 * 3. 裁掉块边缘（4px 内边距），排除圆角、阴影、抗锯齿干扰
 */

import { PNG } from "pngjs";

// ========== 类型 ==========

export type CompareResult = {
  /** 区域匹配率 0-1 */
  matchRate: number;
  /** 是否通过 */
  passed: boolean;
  /** 不匹配的区域数 */
  mismatchedBlocks: number;
  /** 总区域数 */
  totalBlocks: number;
  /** 差异可视化图 */
  diffImage: PNG;
};

export type CompareOptions = {
  /** 区域大小（像素），默认 32 */
  blockSize?: number;
  /** 像素级 Delta E 阈值，默认 5 */
  deltaEThreshold?: number;
  /** 区域内像素通过比例阈值，默认 0.85（85%） */
  pixelPassRatio?: number;
  /** 区域平均 Delta E 上限，默认 5 */
  avgDeltaECap?: number;
  /** 边缘裁剪（排除圆角/阴影），默认 4px */
  edgeTrim?: number;
};

// ========== 色彩空间转换 ==========

/**
 * sRGB → 线性 RGB（gamma 解码）
 */
function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * 线性 RGB → CIE XYZ（D65 白点）
 */
function linearRGBToXYZ(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

/**
 * CIE XYZ → CIE Lab（D65 白点）
 */
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883; // D65

  const fx = labF(x / Xn);
  const fy = labF(y / Yn);
  const fz = labF(z / Zn);

  return [
    116 * fy - 16,   // L*
    500 * (fx - fy),  // a*
    200 * (fy - fz),  // b*
  ];
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
}

/**
 * RGB (0-255) → CIE Lab
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const [x, y, z] = linearRGBToXYZ(lr, lg, lb);
  return xyzToLab(x, y, z);
}

/**
 * CIE76 Delta E（Lab 欧氏距离）
 */
export function deltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ========== 主入口 ==========

/**
 * 分块色彩容差对比
 *
 * 每个区域：
 * 1. 裁掉边缘 trim 像素（排除圆角/阴影/抗锯齿）
 * 2. 对区域内每个像素计算 Delta E
 * 3. 统计 Delta E <= threshold 的像素比例
 * 4. 同时计算区域平均 Delta E
 * 5. pixelPassRatio >= 0.85 && avgDeltaE <= 5 → 通过
 */
export function blockColorCompare(
  baseline: PNG,
  screenshot: PNG,
  options?: CompareOptions,
): CompareResult {
  const blockSize = options?.blockSize ?? 32;
  const deThreshold = options?.deltaEThreshold ?? 5;
  const pixelRatio = options?.pixelPassRatio ?? 0.85;
  const avgCap = options?.avgDeltaECap ?? 5;
  const trim = options?.edgeTrim ?? 4;

  const width = Math.min(baseline.width, screenshot.width);
  const height = Math.min(baseline.height, screenshot.height);

  const cols = Math.floor(width / blockSize);
  const rows = Math.floor(height / blockSize);
  const totalBlocks = cols * rows;

  let mismatchedBlocks = 0;
  const diff = new PNG({ width, height });

  // 复制 baseline 到 diff
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (baseline.width * y + x) << 2;
      const di = (width * y + x) << 2;
      diff.data[di]     = baseline.data[si];
      diff.data[di + 1] = baseline.data[si + 1];
      diff.data[di + 2] = baseline.data[si + 2];
      diff.data[di + 3] = baseline.data[si + 3];
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bx = col * blockSize;
      const by = row * blockSize;

      // 裁掉边缘
      const innerX = bx + trim;
      const innerY = by + trim;
      const innerW = blockSize - trim * 2;
      const innerH = blockSize - trim * 2;

      if (innerW <= 0 || innerH <= 0) continue;

      // 逐像素计算 Delta E
      let passedPixels = 0;
      let totalDeltaE = 0;
      let pixelCount = 0;

      for (let dy = 0; dy < innerH; dy++) {
        for (let dx = 0; dx < innerW; dx++) {
          const px = innerX + dx;
          const py = innerY + dy;
          if (px >= width || py >= height) continue;

          const bi = (baseline.width * py + px) << 2;
          const si = (screenshot.width * py + px) << 2;

          const ba = baseline.data[bi + 3];
          const sa = screenshot.data[si + 3];
          if (ba < 128 || sa < 128) continue;

          const lab1 = rgbToLab(baseline.data[bi], baseline.data[bi + 1], baseline.data[bi + 2]);
          const lab2 = rgbToLab(screenshot.data[si], screenshot.data[si + 1], screenshot.data[si + 2]);

          const de = deltaE(lab1, lab2);
          totalDeltaE += de;
          pixelCount++;

          if (de <= deThreshold) passedPixels++;
        }
      }

      if (pixelCount === 0) continue;

      const ratio = passedPixels / pixelCount;
      const avgDE = totalDeltaE / pixelCount;
      const blockPassed = ratio >= pixelRatio && avgDE <= avgCap;

      // 在 diff 图上标记
      for (let dy = 0; dy < blockSize && by + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < width; dx++) {
          const idx = (width * (by + dy) + (bx + dx)) << 2;
          if (blockPassed) {
            // 通过：暗化表示 OK
            diff.data[idx]     = Math.round(diff.data[idx] * 0.6);
            diff.data[idx + 1] = Math.round(diff.data[idx + 1] * 0.6);
            diff.data[idx + 2] = Math.round(diff.data[idx + 2] * 0.6);
          } else {
            // 不通过：红色标记
            diff.data[idx]     = 255;
            diff.data[idx + 1] = 60;
            diff.data[idx + 2] = 60;
            diff.data[idx + 3] = 180;
          }
        }
      }

      if (!blockPassed) mismatchedBlocks++;
    }
  }

  const matchRate = totalBlocks > 0 ? (totalBlocks - mismatchedBlocks) / totalBlocks : 1;

  return {
    matchRate,
    passed: matchRate >= pixelRatio,
    mismatchedBlocks,
    totalBlocks,
    diffImage: diff,
  };
}

// ========== PNG 工具 ==========

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
