/**
 * Shared tree formatting utilities for DSL node trees
 * Used by both per-section and whole-page LLM generators
 */

import type { DSLNode } from "../types/machine-dsl.js";

export function buildCompactTree(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  depth: number,
): string {
  const indent = "  ".repeat(depth);
  const type = node.type;
  const name = node.name || "unnamed";

  const layoutParts: string[] = [];
  if (node.layout.mode) layoutParts.push(`mode:${node.layout.mode}`);
  if (node.layout.direction) layoutParts.push(`dir:${node.layout.direction}`);
  if (node.layout.justify) layoutParts.push(`justify:${node.layout.justify}`);
  if (node.layout.align) layoutParts.push(`align:${node.layout.align}`);
  if (node.layout.gap !== undefined) layoutParts.push(`gap:${node.layout.gap}`);
  if (node.layout.width !== undefined) layoutParts.push(`w:${node.layout.width}`);
  if (node.layout.height !== undefined) layoutParts.push(`h:${node.layout.height}`);

  const styleParts: string[] = [];
  if (node.style.background) styleParts.push(`bg:${truncate(node.style.background, 30)}`);
  if (node.style.color) styleParts.push(`color:${node.style.color}`);
  if (node.style.fontSize) styleParts.push(`fs:${node.style.fontSize}px`);
  if (node.style.fontWeight) styleParts.push(`fw:${node.style.fontWeight}`);
  if (node.style.borderRadius) styleParts.push(`radius:${node.style.borderRadius.topLeft}px`);
  if (node.style.padding) styleParts.push(`pad:${node.style.padding.top}/${node.style.padding.right}/${node.style.padding.bottom}/${node.style.padding.left}`);

  let content = "";
  if (node.content?.text) content = ` text:"${truncate(node.content.text, 50)}"`;
  if (node.content?.src) content = ` img:"${node.content.src}"`;

  const layoutStr = layoutParts.length > 0 ? ` [${layoutParts.join(", ")}]` : "";
  const styleStr = styleParts.length > 0 ? ` {${styleParts.join(", ")}}` : "";

  let result = `${indent}${type} "${name}"${layoutStr}${styleStr}${content}`;

  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) {
      result += "\n" + buildCompactTree(child, nodeMap, depth + 1);
    }
  }

  return result;
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}
