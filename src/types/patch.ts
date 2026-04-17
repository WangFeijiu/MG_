/**
 * Patch 类型定义
 * 用于存储浏览器插件中的样式修改
 */

import type { DSLNode } from "./machine-dsl.js";

export type PatchDocument = {
  version: number;
  patches: Patch[];
};

export type Patch =
  | UpdateStylePatch
  | UpdateLayoutPatch
  | UpdateContentPatch;

export type UpdateStylePatch = {
  id: string;
  targetNodeId: string;
  op: "update_style";
  payload: Partial<DSLNode["style"]>;
};

export type UpdateLayoutPatch = {
  id: string;
  targetNodeId: string;
  op: "update_layout";
  payload: Partial<DSLNode["layout"]>;
};

export type UpdateContentPatch = {
  id: string;
  targetNodeId: string;
  op: "update_content";
  payload: Partial<NonNullable<DSLNode["content"]>>;
};
