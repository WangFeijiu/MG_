/**
 * DSL 节点布局/样式提取器
 * 把 DSLNode 的 layout.* 和 style.* 转成 CSS 友好的值，供模板函数使用。
 */

import type { DSLNode } from "../types/machine-dsl.js";

export type LayoutValues = {
  width: number | undefined;
  height: number | undefined;
  gap: number | undefined;
  padding: string | undefined;
  borderRadius: number | undefined;
  background: string | undefined;
  color: string | undefined;
  fontSize: number | undefined;
  fontWeight: number | undefined;
  lineHeight: number | undefined;
  flexDirection: string | undefined;
  justifyContent: string | undefined;
  alignItems: string | undefined;
};

export function getLayout(node: DSLNode | undefined): LayoutValues {
  if (!node) return empty();
  const l = node.layout || {};
  const s = node.style || {};
  return {
    width: typeof l.width === "number" ? l.width : undefined,
    height: typeof l.height === "number" ? l.height : undefined,
    gap: typeof l.gap === "number" ? l.gap : undefined,
    padding: fmtPad(s.padding),
    borderRadius: fmtBr(s.borderRadius),
    background: s.background || undefined,
    color: s.color || undefined,
    fontSize: typeof s.fontSize === "number" ? s.fontSize : undefined,
    fontWeight: typeof s.fontWeight === "number" ? s.fontWeight : undefined,
    lineHeight: typeof s.lineHeight === "number" ? s.lineHeight : undefined,
    flexDirection: l.direction || undefined,
    justifyContent: l.justify || undefined,
    alignItems: l.align || undefined,
  };
}

function empty(): LayoutValues {
  return {
    width: undefined, height: undefined, gap: undefined, padding: undefined,
    borderRadius: undefined, background: undefined, color: undefined,
    fontSize: undefined, fontWeight: undefined, lineHeight: undefined,
    flexDirection: undefined, justifyContent: undefined, alignItems: undefined,
  };
}

function fmtPad(p: { top: number; right: number; bottom: number; left: number } | undefined): string | undefined {
  if (!p) return undefined;
  if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) return `${p.top}px`;
  if (p.top === p.bottom && p.left === p.right) return `${p.top}px ${p.right}px`;
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

function fmtBr(br: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } | undefined): number | undefined {
  if (!br) return undefined;
  return br.topLeft;
}

// --- 工具函数 ---

/** 32 → "32px"，undefined → fallback */
export function px(val: number | undefined, fallback: string): string {
  return val !== undefined ? `${Math.round(val)}px` : fallback;
}

/** 值或默认 */
export function fb<T>(val: T | undefined, fallback: T): T {
  return val !== undefined ? val : fallback;
}

/** padding 字符串或默认 */
export function padOr(val: string | undefined, fallback: string): string {
  return val ?? fallback;
}

/** border-radius → "Npx" 或默认 */
export function brOr(val: number | undefined, fallback: string): string {
  return val !== undefined ? `${val}px` : fallback;
}

/** 找 root 的第 idx 个子节点 */
export function childAt(root: DSLNode | undefined, idx: number, nodeMap: Map<string, DSLNode>): DSLNode | undefined {
  if (!root?.children?.[idx]) return undefined;
  return nodeMap.get(root.children[idx]);
}

/** 找 root 的所有直接子节点 */
export function directChildren(root: DSLNode | undefined, nodeMap: Map<string, DSLNode>): DSLNode[] {
  if (!root?.children) return [];
  return root.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];
}

/** 从两个相邻节点的 y 位置计算垂直间距 */
export function verticalGap(a: DSLNode, b: DSLNode): number | undefined {
  const aBottom = Number(a.layout?.y ?? 0) + Number(a.layout?.height ?? 0);
  const bTop = Number(b.layout?.y ?? 0);
  const gap = bTop - aBottom;
  return gap >= 0 ? gap : undefined;
}
