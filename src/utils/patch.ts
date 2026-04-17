/**
 * Patch 工具函数
 * 用于合并 patch 到机器 DSL
 */

import type { MachineDSL } from "../types/machine-dsl.js";
import type { PatchDocument, Patch } from "../types/patch.js";

/**
 * 深度合并对象
 * 递归合并 source 到 target
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const out = { ...target } as any;

  for (const key in source) {
    const value = source[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof out[key] === "object" &&
      out[key] !== null
    ) {
      out[key] = deepMerge(out[key], value as any);
    } else {
      out[key] = value;
    }
  }

  return out;
}

/**
 * 应用 patches 到机器 DSL
 * 返回新的 DSL 对象，不修改原始对象
 */
export function applyPatches(
  dsl: MachineDSL,
  patchDoc: PatchDocument
): MachineDSL {
  // 使用 structuredClone 深拷贝
  const next: MachineDSL = structuredClone(dsl);

  for (const patch of patchDoc.patches) {
    const node = next.nodes.find((n) => n.id === patch.targetNodeId);
    if (!node) {
      console.warn(`Node ${patch.targetNodeId} not found, skipping patch ${patch.id}`);
      continue;
    }

    if (patch.op === "update_style") {
      node.style = deepMerge(node.style, patch.payload);
    }

    if (patch.op === "update_layout") {
      node.layout = deepMerge(node.layout, patch.payload);
    }

    if (patch.op === "update_content") {
      node.content = deepMerge(node.content ?? {}, patch.payload);
    }
  }

  return next;
}

/**
 * 生成唯一的 patch ID
 */
export function generatePatchId(): string {
  return `patch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
