/**
 * 智能容差算法
 * 根据 Section 类型动态调整视觉对比容差，减少误报
 */

export type SectionKind = "text" | "image" | "layout" | "mixed";

export type ToleranceConfig = {
  pixelThreshold: number;
  colorThreshold: number;
  layoutThreshold: number;
};

const PRESETS: Record<SectionKind, ToleranceConfig> = {
  text: { pixelThreshold: 0.02, colorThreshold: 0.03, layoutThreshold: 0.01 },
  image: { pixelThreshold: 0.15, colorThreshold: 0.10, layoutThreshold: 0.05 },
  layout: { pixelThreshold: 0.08, colorThreshold: 0.05, layoutThreshold: 0.03 },
  mixed: { pixelThreshold: 0.10, colorThreshold: 0.07, layoutThreshold: 0.04 },
};

export function classifySection(nodeTypes: string[]): SectionKind {
  const set = new Set(nodeTypes);
  const hasText = set.has("text");
  const hasImage = set.has("image");

  if (hasText && hasImage) return "mixed";
  if (hasText) return "text";
  if (hasImage) return "image";
  return "layout";
}

export function getTolerance(kind: SectionKind): ToleranceConfig {
  return PRESETS[kind];
}

export function shouldReport(
  diffPercent: number,
  kind: SectionKind,
  metric: "pixel" | "color" | "layout" = "pixel",
): boolean {
  const tolerance = PRESETS[kind];
  switch (metric) {
    case "pixel": return diffPercent > tolerance.pixelThreshold;
    case "color": return diffPercent > tolerance.colorThreshold;
    case "layout": return diffPercent > tolerance.layoutThreshold;
  }
}
