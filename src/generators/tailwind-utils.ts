/**
 * Tailwind CSS 工具函数
 *
 * 从 DSL 视觉属性 (px, hex, rgb) 映射到 Tailwind 工具类 token
 * 提取自 react-code.ts, 供 React 组件渲染器复用
 */

// ========== 尺寸 ==========

export function sizeToTailwind(px: number): string {
  if (px <= 0) return "0";
  if (px === 1) return "px";
  if (px === 2) return "0.5";
  if (px === 4) return "1";
  if (px === 6) return "1.5";
  if (px === 8) return "2";
  if (px === 10) return "2.5";
  if (px === 12) return "3";
  if (px === 14) return "3.5";
  if (px === 16) return "4";
  if (px === 20) return "5";
  if (px === 24) return "6";
  if (px === 28) return "7";
  if (px === 32) return "8";
  if (px === 36) return "9";
  if (px === 40) return "10";
  if (px === 44) return "11";
  if (px === 48) return "12";
  if (px === 56) return "14";
  if (px === 64) return "16";
  if (px === 80) return "20";
  if (px === 96) return "24";
  if (px === 112) return "28";
  if (px === 128) return "32";
  if (px === 144) return "36";
  if (px === 160) return "40";
  if (px === 176) return "44";
  if (px === 192) return "48";
  if (px === 208) return "52";
  if (px === 224) return "56";
  if (px === 240) return "60";
  if (px === 256) return "64";
  if (px === 288) return "72";
  if (px === 320) return "80";
  if (px === 384) return "96";

  const tailwindSizes = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384];
  let closest = tailwindSizes[0];
  let minDiff = Math.abs(px - closest);

  for (const size of tailwindSizes) {
    const diff = Math.abs(px - size);
    if (diff < minDiff) {
      minDiff = diff;
      closest = size;
    }
  }

  return sizeToTailwind(closest);
}

export function gapToTailwind(px: number): string {
  return sizeToTailwind(px);
}

// ========== 文字 ==========

export function fontSizeToTailwind(px: number): string {
  if (px <= 10) return "xs";
  if (px <= 12) return "xs";
  if (px <= 14) return "sm";
  if (px <= 16) return "base";
  if (px <= 18) return "lg";
  if (px <= 20) return "xl";
  if (px <= 24) return "2xl";
  if (px <= 30) return "3xl";
  if (px <= 36) return "4xl";
  if (px <= 48) return "5xl";
  if (px <= 60) return "6xl";
  if (px <= 72) return "7xl";
  if (px <= 96) return "8xl";
  return "9xl";
}

export function fontWeightToTailwind(weight: string | number): string {
  if (weight === "normal" || weight === 400) return "normal";
  if (weight === "medium" || weight === 500) return "medium";
  if (weight === "semibold" || weight === 600) return "semibold";
  if (weight === "bold" || weight === 700) return "bold";
  return "normal";
}

// ========== 圆角 ==========

export function borderRadiusToTailwind(px: number): string {
  if (px === 0) return "none";
  if (px <= 2) return "sm";
  if (px <= 4) return "";
  if (px <= 6) return "md";
  if (px <= 8) return "lg";
  if (px <= 12) return "xl";
  if (px <= 16) return "2xl";
  if (px <= 24) return "3xl";
  if (px >= 9999) return "full";
  return "3xl";
}

// ========== 颜色 ==========

export function parseBackgroundToTailwind(bg: string): string {
  if (bg.startsWith("#")) {
    const hex = bg.toLowerCase();

    if (hex === "#ffffff" || hex === "#fff") return "bg-white";
    if (hex.match(/^#f[0-9a-f]{5}$/)) return "bg-gray-50";
    if (hex.match(/^#[ef][0-9a-f]{5}$/)) return "bg-gray-100";
    if (hex.match(/^#[de][0-9a-f]{5}$/)) return "bg-gray-200";
    if (hex.match(/^#[cd][0-9a-f]{5}$/)) return "bg-gray-300";
    if (hex.match(/^#[9ab][0-9a-f]{5}$/)) return "bg-gray-400";
    if (hex.match(/^#[789][0-9a-f]{5}$/)) return "bg-gray-500";
    if (hex.match(/^#[456][0-9a-f]{5}$/)) return "bg-gray-600";
    if (hex.match(/^#[234][0-9a-f]{5}$/)) return "bg-gray-700";
    if (hex.match(/^#[12][0-9a-f]{5}$/)) return "bg-gray-800";
    if (hex === "#000000" || hex === "#000") return "bg-black";

    if (hex.match(/^#[0-5][0-9a-f][7-9a-f][0-9a-f]{3}$/)) return "bg-blue-500";
    if (hex.match(/^#[0-3][0-9a-f][5-7][0-9a-f]{3}$/)) return "bg-blue-600";
    if (hex.match(/^#[ef][0-5][0-5][0-9a-f]{3}$/)) return "bg-red-500";
    if (hex.match(/^#[cd][0-4][0-4][0-9a-f]{3}$/)) return "bg-red-600";
    if (hex.match(/^#[0-5][cd][0-5][0-9a-f]{3}$/)) return "bg-green-500";
    if (hex.match(/^#[0-4][ab][0-4][0-9a-f]{3}$/)) return "bg-green-600";
    if (hex.match(/^#f[cd][a-f][0-9a-f]{3}$/)) return "bg-yellow-400";
    if (hex.match(/^#e[ab][89][0-9a-f]{3}$/)) return "bg-yellow-500";
    if (hex.match(/^#[89][0-5][cd][0-9a-f]{3}$/)) return "bg-purple-500";
    if (hex.match(/^#[67][0-4][ab][0-9a-f]{3}$/)) return "bg-purple-600";
    if (hex.match(/^#[ef][0-5][89][0-9a-f]{3}$/)) return "bg-pink-500";
    if (hex.match(/^#f[89][0-5][0-9a-f]{3}$/)) return "bg-orange-500";
  }

  if (bg.includes("rgb")) {
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);

      if (r > 250 && g > 250 && b > 250) return "bg-white";
      if (r < 20 && g < 20 && b < 20) return "bg-black";

      if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
        const avg = (r + g + b) / 3;
        if (avg > 240) return "bg-gray-50";
        if (avg > 220) return "bg-gray-100";
        if (avg > 200) return "bg-gray-200";
        if (avg > 180) return "bg-gray-300";
        if (avg > 140) return "bg-gray-400";
        if (avg > 100) return "bg-gray-500";
        if (avg > 70) return "bg-gray-600";
        if (avg > 40) return "bg-gray-700";
        return "bg-gray-800";
      }

      if (b > r && b > g && b - r > 50) return "bg-blue-500";
      if (r > g && r > b && r - g > 50) return "bg-red-500";
      if (g > r && g > b && g - r > 50) return "bg-green-500";
      if (r > 200 && g > 200 && b < 100) return "bg-yellow-400";
      if (r > 100 && b > 100 && g < 100) return "bg-purple-500";
      if (r > 200 && g > 100 && g < 200 && b < 100) return "bg-orange-500";
    }
  }

  return "bg-gray-100";
}

export function parseColorToTailwind(color: string): string {
  if (color.startsWith("#")) {
    const hex = color.toLowerCase();

    if (hex === "#ffffff" || hex === "#fff") return "text-white";
    if (hex === "#000000" || hex === "#000") return "text-black";
    if (hex.match(/^#[012][0-9a-f]{5}$/)) return "text-gray-900";
    if (hex.match(/^#[234][0-9a-f]{5}$/)) return "text-gray-800";
    if (hex.match(/^#[456][0-9a-f]{5}$/)) return "text-gray-700";
    if (hex.match(/^#[789][0-9a-f]{5}$/)) return "text-gray-600";
    if (hex.match(/^#[9ab][0-9a-f]{5}$/)) return "text-gray-500";

    if (hex.match(/^#[0-5][0-9a-f][7-9a-f][0-9a-f]{3}$/)) return "text-blue-600";
    if (hex.match(/^#[ef][0-5][0-5][0-9a-f]{3}$/)) return "text-red-600";
    if (hex.match(/^#[0-5][cd][0-5][0-9a-f]{3}$/)) return "text-green-600";
    if (hex.match(/^#[ef][cd][a-f][0-9a-f]{3}$/)) return "text-yellow-600";
    if (hex.match(/^#[89][0-5][cd][0-9a-f]{3}$/)) return "text-purple-600";
    if (hex.match(/^#[ef][0-5][89][0-9a-f]{3}$/)) return "text-pink-600";
    if (hex.match(/^#f[89][0-5][0-9a-f]{3}$/)) return "text-orange-600";
  }

  if (color.includes("rgb")) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);

      if (r > 250 && g > 250 && b > 250) return "text-white";
      if (r < 50 && g < 50 && b < 50) return "text-gray-900";

      if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
        const avg = (r + g + b) / 3;
        if (avg < 50) return "text-gray-900";
        if (avg < 80) return "text-gray-800";
        if (avg < 110) return "text-gray-700";
        if (avg < 140) return "text-gray-600";
        return "text-gray-500";
      }

      if (b > r && b > g && b - r > 50) return "text-blue-600";
      if (r > g && r > b && r - g > 50) return "text-red-600";
      if (g > r && g > b && g - r > 50) return "text-green-600";
    }
  }

  return "text-gray-800";
}

// ========== Flex 布局 ==========

export function tailwindJustify(justify: string): string {
  const map: Record<string, string> = {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    "center": "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
  };
  return map[justify] || "";
}

export function tailwindAlign(align: string): string {
  const map: Record<string, string> = {
    "flex-start": "items-start",
    "flex-end": "items-end",
    "center": "items-center",
    "stretch": "items-stretch",
  };
  return map[align] || "";
}
