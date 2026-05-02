/**
 * Global Design System Generator
 *
 * 从整个页面 DSL 中提取语义级设计系统（colors/fonts/spacing/radii/shadows）
 * 输出类似 Kimi 的 :root 变量 + 共享工具类
 *
 * 策略：
 * 1. 颜色按使用场景聚类（文本色、背景色、主色、边框色）
 * 2. 间距按数值聚类（sm/md/lg/xl）
 * 3. 圆角按数值聚类
 * 4. 提取页面内容宽度模式
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";

export type GlobalDesignSystem = {
  /** :root CSS 变量块 */
  rootCSS: string;
  /** 共享工具类（container, btn-primary 等） */
  utilityCSS: string;
  /** 字体加载 HTML */
  fontLinks: string;
  /** 语义变量名 → 原始值 */
  variables: Map<string, string>;
  /** 页面常用内容宽度 */
  contentWidth: number;
};

export function generateGlobalDesignSystem(dsl: MachineDSL): GlobalDesignSystem {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  // ===== 颜色分析 =====
  const colorStats = analyzeColors(dsl.nodes);
  const colorVars = buildSemanticColorVars(colorStats);

  // ===== 字体分析 =====
  const fontStats = analyzeFonts(dsl.nodes);
  const fontVars = buildSemanticFontVars(fontStats);

  // ===== 间距分析 =====
  const spacingStats = analyzeSpacings(dsl.nodes);
  const spacingVars = buildSemanticSpacingVars(spacingStats);

  // ===== 圆角分析 =====
  const radiusStats = analyzeRadii(dsl.nodes);
  const radiusVars = buildSemanticRadiusVars(radiusStats);

  // ===== 页面宽度模式 =====
  const contentWidth = detectContentWidth(dsl.nodes, nodeMap);

  // ===== 组装 :root =====
  const rootLines: string[] = [":root {"];
  for (const [name, value] of colorVars) {
    rootLines.push(`  ${name}: ${value};`);
  }
  for (const [name, value] of fontVars) {
    rootLines.push(`  ${name}: ${value};`);
  }
  for (const [name, value] of spacingVars) {
    rootLines.push(`  ${name}: ${value};`);
  }
  for (const [name, value] of radiusVars) {
    rootLines.push(`  ${name}: ${value};`);
  }
  rootLines.push(`  --content-width: ${contentWidth}px;`);
  rootLines.push("  --max-width: 1440px;");
  rootLines.push("}");

  const rootCSS = rootLines.join("\n");

  // ===== 共享工具类 =====
  const utilityCSS = buildUtilityCSS(fontStats.primaryFont);

  // ===== 字体加载 =====
  const fontLinks = buildFontLinks(fontStats);

  // 合并所有变量
  const variables = new Map<string, string>();
  for (const [k, v] of colorVars) variables.set(k, v);
  for (const [k, v] of fontVars) variables.set(k, v);
  for (const [k, v] of spacingVars) variables.set(k, v);
  for (const [k, v] of radiusVars) variables.set(k, v);
  variables.set("--content-width", `${contentWidth}px`);
  variables.set("--max-width", "1440px");

  return { rootCSS, utilityCSS, fontLinks, variables, contentWidth };
}

// ========== 颜色分析 ==========

type ColorStats = {
  all: Map<string, number>;
  text: Map<string, number>;
  background: Map<string, number>;
  fill: Map<string, number>;
};

function analyzeColors(nodes: DSLNode[]): ColorStats {
  const all = new Map<string, number>();
  const text = new Map<string, number>();
  const background = new Map<string, number>();
  const fill = new Map<string, number>();

  for (const node of nodes) {
    const s = node.style;
    if (s.color) {
      bump(all, s.color);
      bump(text, s.color);
    }
    if (s.background && !s.background.startsWith("url")) {
      bump(all, s.background);
      bump(background, s.background);
    }
  }

  return { all, text, background, fill };
}

function buildSemanticColorVars(stats: ColorStats): Map<string, string> {
  const vars = new Map<string, string>();
  const assigned = new Set<string>();

  function assign(raw: string, semanticName: string) {
    if (!raw || assigned.has(raw)) return;
    assigned.add(raw);
    vars.set(semanticName, raw);
  }

  // 按频次排序
  const textSorted = sortByFreq(stats.text);
  const bgSorted = sortByFreq(stats.background);
  const allSorted = sortByFreq(stats.all);

  // Helper: get perceived alpha (for rgba) — solid colors have alpha ~1
  function getAlpha(color: string): number {
    const rgba = parseColor(color);
    if (rgba && rgba[3] !== undefined) return rgba[3];
    return 1;
  }

  // Helper: is this a near-solid white (white with high alpha)?
  function isNearWhite(color: string): boolean {
    const rgb = parseColor(color);
    if (!rgb || rgb[3] !== undefined) return false;
    const [r, g, b] = rgb;
    return r > 240 && g > 240 && b > 240;
  }

  // Helper: is this a near-black color?
  function isNearBlack(color: string): boolean {
    const rgb = parseColor(color);
    if (!rgb || rgb[3] !== undefined) return false;
    const [r, g, b] = rgb;
    return r < 20 && g < 20 && b < 20;
  }

  // 1. 文本色层级 — 只取实心不透明的颜色，skip rgba with low alpha
  // Skip near-white colors (those are decorative/lights, not text)
  for (const [color] of textSorted) {
    if (isNearWhite(color)) continue; // skip white as text color
    const alpha = getAlpha(color);
    if (alpha < 0.3) continue; // skip transparent overlays
    const luminance = getLuminance(color);
    if (luminance < 0.4) {
      if (!vars.has("--text-primary")) { assign(color, "--text-primary"); continue; }
      if (!vars.has("--text-secondary")) { assign(color, "--text-secondary"); continue; }
    } else if (luminance < 0.7) {
      if (!vars.has("--text-secondary")) { assign(color, "--text-secondary"); continue; }
      if (!vars.has("--text-tertiary")) { assign(color, "--text-tertiary"); continue; }
    } else if (!vars.has("--text-muted") && alpha >= 0.8 && !isNearWhite(color)) {
      assign(color, "--text-muted");
    }
  }
  // 1b. 兜底 text 变量
  if (!vars.has("--text-primary")) vars.set("--text-primary", "rgba(0,0,0,0.88)");
  if (!vars.has("--text-secondary")) vars.set("--text-secondary", "rgba(0,0,0,0.75)");
  if (!vars.has("--text-tertiary")) vars.set("--text-tertiary", "rgba(0,0,0,0.55)");
  if (!vars.has("--text-muted")) vars.set("--text-muted", "rgba(0,0,0,0.45)");
  if (!vars.has("--text-disabled")) vars.set("--text-disabled", "rgba(0,0,0,0.25)");

  // 2. 背景色层级 — 优先 solid 不透明的颜色
  // 背景色通常用 rgba(r,g,b,low-alpha) 表示 overlay 或半透明效果
  // solid white (#FFFFFF) 是最常见的页面背景
  const solidWhiteColor = bgSorted.find(([c]) => {
    const rgb = parseColor(c);
    return rgb && rgb[3] === undefined && rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240;
  });
  if (solidWhiteColor && !vars.has("--surface")) {
    assign(solidWhiteColor[0], "--surface");
  }

  // 处理半透明背景色（section 背景）
  // 注意：半透明白色 rgba(255,255,255,alpha) 是 lighting 效果，不是 surface
  for (const [color] of bgSorted) {
    if (assigned.has(color)) continue;
    const alpha = getAlpha(color);
    const lum = getLuminance(color);

    // 跳过半透明白色（lighting 效果，不应该作为 surface 变量）
    if (lum > 0.9 && alpha < 0.9) continue;

    if (alpha >= 0.1 && alpha < 0.9) {
      if (lum < 0.1) {
        if (!vars.has("--surface-6")) assign(color, "--surface-6");
      } else if (lum < 0.15) {
        if (!vars.has("--surface-4")) assign(color, "--surface-4");
      } else if (alpha >= 0.05) {
        if (!vars.has("--surface-2")) assign(color, "--surface-2");
      }
    }
  }

  // 确保 surface-2/4/6 兜底
  if (!vars.has("--surface-2")) vars.set("--surface-2", "rgba(0,0,0,0.02)");
  if (!vars.has("--surface-4")) vars.set("--surface-4", "rgba(0,0,0,0.04)");
  if (!vars.has("--surface-6")) vars.set("--surface-6", "rgba(0,0,0,0.06)");

  // 3. 主色（出现频次高且饱和度高的非灰度色）
  for (const [color] of allSorted) {
    if (assigned.has(color)) continue;
    const alpha = getAlpha(color);
    if (alpha < 0.5) continue; // skip transparent overlays as primary
    const sat = getSaturation(color);
    if (sat > 0.3) {
      if (!vars.has("--primary")) { assign(color, "--primary"); continue; }
    }
  }

  // 3b. 如果主色是透明色但有对应的不透明变体可用，从透明变体推导
  if (vars.has("--primary")) {
    const primary = vars.get("--primary")!;
    if (primary.includes("rgba") && primary.match(/,\s*[\d.]+\s*\)/)) {
      // rgba 主色 → 生成不透明变体（把 alpha 设为 1）
      const rgbaMatch = primary.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/);
      if (rgbaMatch) {
        const [, r, g, b] = rgbaMatch;
        vars.set("--primary-solid", `rgb(${r}, ${g}, ${b})`);
        vars.set("--primary", `rgba(${r}, ${g}, ${b}, 1)`);
        vars.set("--primary-10", `rgba(${r}, ${g}, ${b}, 0.1)`);
        vars.set("--primary-20", `rgba(${r}, ${g}, ${b}, 0.2)`);
      }
    }
  }

  // 3c. 兜底主色
  if (!vars.has("--primary")) vars.set("--primary", "#5747F4");

  // 4. 边框色
  for (const [color] of allSorted) {
    if (assigned.has(color)) continue;
    const lum = getLuminance(color);
    if (lum > 0.7 && lum < 0.95) {
      if (!vars.has("--border")) { assign(color, "--border"); continue; }
      if (!vars.has("--border-light")) { assign(color, "--border-light"); continue; }
    }
  }

  // 5. 兜底：black/white 纯色
  if (!vars.has("--white")) vars.set("--white", "#FFFFFF");
  if (!vars.has("--black")) vars.set("--black", "#000000");

  // 6. 确保有 surface
  if (!vars.has("--surface")) {
    if (!assigned.has("#FFFFFF")) { vars.set("--surface", "#FFFFFF"); }
    else { vars.set("--surface", "var(--white)"); }
  }

  // 7. 为主色生成透明变体
  const primary = vars.get("--primary");
  if (primary && primary.startsWith("#")) {
    vars.set("--primary-10", hexToRgba(primary, 0.1));
  }

  return vars;
}

// ========== 字体分析 ==========

type FontStats = {
  families: Map<string, number>;
  weights: Map<number, number>;
  sizes: Map<number, number>;
  primaryFont: string;
};

function analyzeFonts(nodes: DSLNode[]): FontStats {
  const families = new Map<string, number>();
  const weights = new Map<number, number>();
  const sizes = new Map<number, number>();

  for (const node of nodes) {
    const s = node.style;
    if (s.fontFamily) bump(families, s.fontFamily);
    if (s.fontWeight && typeof s.fontWeight === "number") bump(weights, s.fontWeight);
    if (s.fontSize && typeof s.fontSize === "number") bump(sizes, s.fontSize);
  }

  const primaryFont = sortByFreq(families)[0]?.[0] || "Poppins";
  return { families, weights, sizes, primaryFont };
}

function buildSemanticFontVars(stats: FontStats): Map<string, string> {
  const vars = new Map<string, string>();
  vars.set("--font-base", `'${stats.primaryFont}', system-ui, -apple-system, sans-serif`);

  // 字重
  const sortedWeights = [...stats.weights.entries()].sort((a, b) => b[1] - a[1]);
  const weightNames: [number, string][] = [
    [400, "--font-normal"],
    [500, "--font-medium"],
    [600, "--font-semibold"],
    [700, "--font-bold"],
  ];
  for (const [w, name] of weightNames) {
    if (stats.weights.has(w)) vars.set(name, String(w));
  }

  return vars;
}

function buildFontLinks(stats: FontStats): string {
  const family = stats.primaryFont;
  const weights = [...stats.weights.keys()].sort((a, b) => a - b);
  const weightStr = weights.length > 0 ? weights.join(";") : "400;500;600;700";

  // 生成 Google Fonts 链接（简化版，常用字体）
  const googleFonts = ["Poppins", "Inter", "Roboto", "Open Sans", "Lato", "Montserrat"];
  if (googleFonts.includes(family)) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weightStr}&display=swap" rel="stylesheet">`;
  }
  return "";
}

// ========== 间距分析 ==========

function analyzeSpacings(nodes: DSLNode[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const node of nodes) {
    const s = node.style;
    if (s.padding) {
      bump(freq, s.padding.top);
      bump(freq, s.padding.right);
      bump(freq, s.padding.bottom);
      bump(freq, s.padding.left);
    }
    if (node.layout.gap !== undefined) bump(freq, node.layout.gap);
  }
  return freq;
}

function buildSemanticSpacingVars(freq: Map<number, number>): Map<string, string> {
  const vars = new Map<string, string>();
  const sorted = [...freq.entries()].sort((a, b) => a[0] - b[0]);

  const mappings: [string, number][] = [
    ["--space-xs", 4],
    ["--space-sm", 8],
    ["--space-md", 16],
    ["--space-lg", 24],
    ["--space-xl", 32],
    ["--space-2xl", 48],
    ["--space-3xl", 64],
    ["--space-4xl", 80],
  ];

  for (const [name, target] of mappings) {
    // 找最接近 target 的实际值
    let bestVal = target;
    let bestDiff = Infinity;
    for (const [val, count] of sorted) {
      const diff = Math.abs(val - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestVal = val;
      }
    }
    if (bestDiff <= 8) {
      vars.set(name, `${bestVal}px`);
    }
  }

  return vars;
}

// ========== 圆角分析 ==========

function analyzeRadii(nodes: DSLNode[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const node of nodes) {
    const br = node.style.borderRadius;
    if (br) {
      const vals = br.linked ? [br.topLeft] : [br.topLeft, br.topRight, br.bottomRight, br.bottomLeft];
      for (const v of vals) bump(freq, v);
    }
  }
  return freq;
}

function buildSemanticRadiusVars(freq: Map<number, number>): Map<string, string> {
  const vars = new Map<string, string>();
  const sorted = [...freq.entries()].sort((a, b) => a[0] - b[0]);

  const mappings: [string, number][] = [
    ["--radius-sm", 10],
    ["--radius-md", 18],
    ["--radius-lg", 80],
    ["--radius-xl", 100],
    ["--radius-full", 300],
  ];

  for (const [name, target] of mappings) {
    let bestVal = target;
    let bestDiff = Infinity;
    for (const [val, count] of sorted) {
      const diff = Math.abs(val - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestVal = val;
      }
    }
    if (bestDiff <= 10 || name === "--radius-full") {
      vars.set(name, `${bestVal}px`);
    }
  }

  return vars;
}

// ========== 页面宽度检测 ==========

function detectContentWidth(nodes: DSLNode[], nodeMap: Map<string, DSLNode>): number {
  // 找最常见的非全宽容器宽度
  const widths = new Map<number, number>();
  const root = nodes.find(n => n.parentId === null);
  if (!root) return 1200;

  const pageWidth = typeof root.layout.width === "number" ? root.layout.width : 1440;

  for (const node of nodes) {
    const w = typeof node.layout.width === "number" ? node.layout.width : 0;
    if (w > 600 && w < pageWidth) {
      bump(widths, Math.round(w / 10) * 10); // 按 10px 取整
    }
  }

  const sorted = sortByFreq(widths);
  if (sorted.length > 0) {
    return sorted[0][0];
  }
  return Math.min(1200, pageWidth);
}

// ========== 工具类 ==========

function buildUtilityCSS(primaryFont: string): string {
  return `* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-base);
  color: var(--text-primary);
  background: var(--surface);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
img { max-width: 100%; display: block; }
a { text-decoration: none; color: inherit; }
button { border: none; background: none; cursor: pointer; font-family: inherit; }

.container {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 0 24px;
}

.section-header {
  text-align: center;
  max-width: 960px;
  margin: 0 auto 48px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--text-primary);
  color: var(--white);
  padding: 14px 32px;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 600;
  transition: transform 0.2s, opacity 0.2s;
}
.btn-primary:hover { transform: translateY(-1px); opacity: 0.9; }

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-6);
  color: var(--text-primary);
  padding: 14px 32px;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 500;
  transition: background 0.2s;
}
.btn-secondary:hover { background: var(--surface-4); }

.btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 14px 32px;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 500;
  transition: background 0.2s, border-color 0.2s;
}
.btn-outline:hover { border-color: var(--text-secondary); }

.img-wrapper {
  overflow: hidden;
  border-radius: var(--radius-md);
}
.img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.page-wrapper {
  max-width: var(--max-width);
  margin: 0 auto;
}`;
}

// ========== 工具函数 ==========

function bump<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortByFreq<K>(map: Map<K, number>): [K, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function getLuminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0.5;
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const c = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}

function getSaturation(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0;
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function parseColor(color: string): [number, number, number, number?] | null {
  color = color.trim().toLowerCase();
  // #rgb
  if (color.startsWith("#") && color.length === 4) {
    return [
      parseInt(color[1] + color[1], 16),
      parseInt(color[2] + color[2], 16),
      parseInt(color[3] + color[3], 16),
    ];
  }
  // #rrggbb
  if (color.startsWith("#") && color.length === 7) {
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ];
  }
  // rgba()
  const rgbaMatch = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (rgbaMatch) {
    return [parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]), parseFloat(rgbaMatch[4])];
  }
  // rgb()
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
