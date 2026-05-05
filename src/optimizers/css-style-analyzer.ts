/**
 * CSS Style Analyzer — 区分 necessary inline vs bad inline
 *
 * Necessary inline: 布局必需且难以抽取的 (position, left, top, width, height 等)
 * Bad inline: 可抽取的 (重复的 font, color, padding, background 等)
 */

export type StyleCategory = "necessary" | "extractable";

const NECESSARY_PROPERTIES = new Set([
  "position", "left", "top", "right", "bottom",
  "width", "height",
  "overflow",
  "object-fit", "object-position",
  "aspect-ratio",
  "z-index",
  "opacity",
  "transform",
  "display",  // layout-specific, often unique
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "justify-content", "align-items", "align-self", "gap",
  "grid-template-columns", "grid-column", "grid-row",
]);

export function classifyInlineStyle(styleAttr: string): StyleCategory {
  const decls = styleAttr.split(";").map(s => s.trim()).filter(s => s.includes(":"));

  if (decls.length === 0) return "necessary";

  let necessaryCount = 0;
  let extractableCount = 0;

  for (const decl of decls) {
    const prop = decl.split(":")[0].trim().toLowerCase();
    if (NECESSARY_PROPERTIES.has(prop)) {
      necessaryCount++;
    } else {
      extractableCount++;
    }
  }

  // 如果大多数属性是布局必需的 → necessary
  return necessaryCount > extractableCount ? "necessary" : "extractable";
}

export function computeBadInlineRatio(styleAttrs: string[]): number {
  if (styleAttrs.length === 0) return 0;
  let badCount = 0;
  for (const s of styleAttrs) {
    if (classifyInlineStyle(s) === "extractable") badCount++;
  }
  return badCount / styleAttrs.length;
}
