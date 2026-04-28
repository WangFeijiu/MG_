/**
 * 机器 DSL 类型定义
 * 这是整个工具链的核心数据结构
 */

export type MachineDSL = {
  page: {
    id: string;
    name: string;
    width: number;
    height: number;
  };
  nodes: DSLNode[];
};

export type DSLNodeType =
  | "page"
  | "container"
  | "text"
  | "image"
  | "button"
  | "icon";

export type LayoutMode = "absolute" | "flex";
export type FlexDirection = "row" | "column";
export type OverflowMode = "visible" | "hidden";
export type ObjectFit = "fill" | "contain" | "cover";

export type BorderRadius = {
  linked: boolean;
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export type Spacing = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type DSLNode = {
  id: string;
  type: DSLNodeType;
  name?: string;
  parentId: string | null;
  children: string[];

  layout: {
    mode?: LayoutMode;
    direction?: FlexDirection;
    justify?: string;
    align?: string;
    wrap?: string;
    gap?: number;
    x?: number;
    y?: number;
    width?: number | string;
    height?: number | string;
    flexShrink?: number;
  };

  style: {
    background?: string;
    backgroundImage?: string;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    lineHeight?: number;
    textAlign?: string;
    borderRadius?: BorderRadius;
    overflow?: OverflowMode;
    padding?: Spacing;
    margin?: Spacing;
    objectFit?: ObjectFit;
    boxShadow?: string;
    border?: string;
  };

  content?: {
    text?: string;
    src?: string;
  };

  meta?: {
    sourceNodeId?: string;
    componentHint?: string;
    semanticType?: string;
  };
};
