/**
 * 三层组件识别器
 *
 * Layer 1: 原子 UI 组件 — button / image / text / icon / link
 * Layer 2: 布局组件 — section / container / grid / card-list / stack / accordion / card
 * Layer 3: 业务语义 — hero / navbar / FAQ / CTA / footer (可选增强)
 *
 * 识别依据: 视觉属性(borderRadius, size) + 结构属性(children pattern)
 */

import type { DSLNode } from "../types/machine-dsl.js";

export type UIComponent =
  | "button" | "image" | "text" | "icon" | "link"
  | "card" | "grid" | "card-list" | "stack" | "accordion"
  | "section" | "container" | "unknown";

export type ComponentRecognition = {
  nodeId: string;
  component: UIComponent;
  confidence: number;
  reason: string;
  animatable: boolean;
};

export function recognizeComponents(
  nodes: DSLNode[],
  nodeMap: Map<string, DSLNode>,
): ComponentRecognition[] {
  const results: ComponentRecognition[] = [];

  for (const node of nodes) {
    const rec = recognizeNode(node, nodeMap);
    results.push(rec);
  }

  return results;
}

function recognizeNode(node: DSLNode, nodeMap: Map<string, DSLNode>): ComponentRecognition {
  const w = typeof node.layout.width === "number" ? node.layout.width : 0;
  const h = typeof node.layout.height === "number" ? node.layout.height : 0;
  const children = node.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];
  const radius = node.style?.borderRadius;
  const bg = node.style?.background;
  const cursor = node.style?.cursor;

  // ========== Layer 1: 原子 UI ==========

  // Image (普通 image 不动, 只 hero-image / banner 才启用 — 暂未实现)
  if (node.type === "image") {
    return { nodeId: node.id, component: "image", confidence: 1, reason: "type=image", animatable: false };
  }

  // Text
  if (node.type === "text") {
    return { nodeId: node.id, component: "text", confidence: 1, reason: "type=text", animatable: false };
  }

  // Icon (装饰 icon 一直 pulse 显得廉价, 默认关)
  if (node.type === "icon") {
    return { nodeId: node.id, component: "icon", confidence: 1, reason: "type=icon", animatable: false };
  }

  // Button: small container with borderRadius + text child
  if (node.type === "container" && radius && w >= 50 && w <= 500 && h >= 20 && h <= 80) {
    const hasText = children.some(c => c.type === "text");
    if (hasText) {
      return { nodeId: node.id, component: "button", confidence: 0.9, reason: "small rounded container + text", animatable: true };
    }
  }

  // Link: button-like but with cursor:pointer or smaller
  if (node.type === "container" && cursor === "pointer" && h <= 50) {
    return { nodeId: node.id, component: "link", confidence: 0.8, reason: "clickable small element", animatable: true };
  }

  // ========== Layer 2: 布局组件 ==========

  // Card: medium container with borderRadius, multiple children
  if (node.type === "container" && radius && w >= 150 && h >= 100 && children.length >= 2) {
    return { nodeId: node.id, component: "card", confidence: 0.85, reason: "medium rounded container + children", animatable: true };
  }

  // Grid / Card-list: 3+ similar children
  if (node.type === "container" && children.length >= 3) {
    const childHeights = children.map(c => typeof c.layout.height === "number" ? c.layout.height : 0).filter(x => x > 0);
    if (childHeights.length >= 3) {
      const avg = childHeights.reduce((a, b) => a + b, 0) / childHeights.length;
      const similar = childHeights.filter(x => Math.abs(x - avg) < avg * 0.5).length;
      if (similar >= childHeights.length * 0.6) {
        // Check if multi-column (x variation) → grid, single column → card-list
        const childXs = children.map(c => c.layout.x ?? 0);
        const uniqueX = new Set(childXs.map(x => Math.round(x / 20) * 20));
        const isGrid = uniqueX.size >= 2;
        return {
          nodeId: node.id,
          component: isGrid ? "grid" : "card-list",
          confidence: 0.85,
          reason: `${children.length} similar children, ${isGrid ? "multi-column" : "single-column"}`,
          animatable: true,
        };
      }
    }
  }

  // Stack: container with 2+ text children
  if (node.type === "container" && children.filter(c => c.type === "text").length >= 2) {
    const textChildren = children.filter(c => c.type === "text");
    // Vertical stack if y positions differ
    const ys = textChildren.map(c => c.layout.y ?? 0);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (yRange > 10) {
      return { nodeId: node.id, component: "stack", confidence: 0.8, reason: "vertical text group", animatable: false };
    }
  }

  // Accordion: container with alternating title/content pattern
  if (node.type === "container" && children.length >= 4) {
    const textCount = children.filter(c => c.type === "text").length;
    const containerCount = children.filter(c => c.type === "container").length;
    if (textCount >= 2 && containerCount >= 2 && textCount + containerCount === children.length) {
      return { nodeId: node.id, component: "accordion", confidence: 0.7, reason: "alternating text+container pattern", animatable: true };
    }
  }

  // Section: top-level large container (fade-in 全开会让首屏抖, 默认关)
  if (node.type === "container" && h >= 200 && children.length >= 2) {
    return { nodeId: node.id, component: "section", confidence: 0.7, reason: "large container", animatable: false };
  }

  // Generic container
  if (node.type === "container") {
    return { nodeId: node.id, component: "container", confidence: 0.5, reason: "container fallback", animatable: false };
  }

  return { nodeId: node.id, component: "unknown", confidence: 0, reason: "unrecognized", animatable: false };
}
