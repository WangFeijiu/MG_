/**
 * Design Token 提取器
 * 从 Machine DSL 中提取颜色、字体、间距等样式值
 * 聚类后生成 CSS 变量映射表
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";

// ========== 输出类型 ==========

export type DesignTokens = {
  colors: TokenGroup;
  fonts: TokenGroup;
  spacings: TokenGroup;
  radii: TokenGroup;
  shadows: TokenGroup;
};

export type TokenGroup = {
  /** CSS 变量名 → CSS 值 */
  variables: Map<string, string>;
  /** 原始值 → CSS 变量名（用于替换） */
  lookup: Map<string, string>;
};

// ========== 提取 ==========

export function extractDesignTokens(dsl: MachineDSL): DesignTokens {
  const colorFreq = new Map<string, number>();
  const fontFreq = new Map<string, number>();
  const spacingFreq = new Map<string, number>();
  const radiusFreq = new Map<string, number>();
  const shadowFreq = new Map<string, number>();

  for (const node of dsl.nodes) {
    collectFromNode(node, colorFreq, fontFreq, spacingFreq, radiusFreq, shadowFreq);
  }

  return {
    colors: buildTokenGroup(colorFreq, "color"),
    fonts: buildTokenGroup(fontFreq, "font"),
    spacings: buildTokenGroup(spacingFreq, "spacing"),
    radii: buildTokenGroup(radiusFreq, "radius"),
    shadows: buildTokenGroup(shadowFreq, "shadow"),
  };
}

// ========== 收集 ==========

function collectFromNode(
  node: DSLNode,
  colors: Map<string, number>,
  fonts: Map<string, number>,
  spacings: Map<string, number>,
  radii: Map<string, number>,
  shadows: Map<string, number>,
): void {
  const s = node.style;

  // 颜色
  if (s.color) bump(colors, s.color);
  if (s.background && !s.background.startsWith("url")) bump(colors, s.background);

  // 字体 — 只收集 fontFamily（不区分 weight/size，避免重复变量）
  if (s.fontFamily) {
    bump(fonts, s.fontFamily);
  }

  // 间距 — 收集 padding/gap 的各个值
  if (s.padding) collectSpacingValues(s.padding, spacings);
  if (s.margin) collectSpacingValues(s.margin, spacings);
  if (node.layout.gap !== undefined) bump(spacings, String(node.layout.gap));

  // 圆角
  if (s.borderRadius) {
    const br = s.borderRadius;
    if (br.linked) {
      bump(radii, String(br.topLeft));
    } else {
      bump(radii, `${br.topLeft}|${br.topRight}|${br.bottomRight}|${br.bottomLeft}`);
    }
  }

  // 阴影
  if (s.boxShadow) bump(shadows, s.boxShadow);
}

function collectSpacingValues(spacing: Spacing, freq: Map<string, number>): void {
  bump(freq, String(spacing.top));
  bump(freq, String(spacing.right));
  bump(freq, String(spacing.bottom));
  bump(freq, String(spacing.left));
}

function bump(freq: Map<string, number>, key: string): void {
  freq.set(key, (freq.get(key) ?? 0) + 1);
}

// ========== 构建分组 ==========

function buildTokenGroup(freq: Map<string, number>, prefix: string): TokenGroup {
  const variables = new Map<string, string>();
  const lookup = new Map<string, string>();

  // 按频次降序排列，高频值获得更短的名称
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  // 只对出现 >=2 次的值生成变量（避免单次使用增加文件大小）
  let idx = 0;
  for (const [raw, count] of sorted) {
    if (count < 2) continue;

    const varName = `--${prefix}-${idx + 1}`;
    const cssValue = rawToCssValue(raw, prefix);

    variables.set(varName, cssValue);
    lookup.set(raw, varName);
    idx++;
  }

  return { variables, lookup };
}

/**
 * 将原始值转为 CSS 值
 * 字体的复合键 "Poppins|600|14" 需要特殊处理
 */
function rawToCssValue(raw: string, prefix: string): string {
  if (prefix === "spacing") {
    return `${raw}px`;
  }
  if (prefix === "radius") {
    if (raw.includes("|")) {
      return raw.split("|").map(v => `${v}px`).join(" ");
    }
    return `${raw}px`;
  }
  return raw;
}

// ========== CSS 变量输出 ==========

export function generateCSSTokenBlock(tokens: DesignTokens): string {
  const lines: string[] = [":root {"];

  for (const [varName, value] of tokens.colors.variables) {
    lines.push(`  ${varName}: ${value};`);
  }
  for (const [varName, value] of tokens.fonts.variables) {
    lines.push(`  ${varName}: '${value}', sans-serif;`);
  }
  for (const [varName, value] of tokens.spacings.variables) {
    lines.push(`  ${varName}: ${value};`);
  }
  for (const [varName, value] of tokens.radii.variables) {
    lines.push(`  ${varName}: ${value};`);
  }
  for (const [varName, value] of tokens.shadows.variables) {
    lines.push(`  ${varName}: ${value};`);
  }

  lines.push("}");
  return lines.join("\n");
}
