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
    opacity?: number;
    transform?: string;
    transition?: string;
    cursor?: string;
    pointerEvents?: string;
    letterSpacing?: number;
    textTransform?: string;
    strokeAlign?: "inside" | "outside" | "center";
  };

  content?: {
    text?: string;
    src?: string;
  };

  meta?: {
    sourceNodeId?: string;
    componentHint?: string;
    semanticType?: string;
    /** SVG path 数据（来自 PATH 节点） */
    svgPaths?: Array<{ fill: string; data: string }>;
    /** effect 引用 ID（用于从原始 DSL 查找阴影） */
    effectRef?: string;
    /** 文本模式 */
    textMode?: "single-line" | "auto-height";
    /** 多色文本范围 */
    textColorRanges?: Array<{ start: number; end: number; color: string }>;
    /** 字体引用（用于从原始 DSL 精确查找） */
    fontRef?: string;
    /** 语义 paint token 名 */
    paintTokenName?: string;
  };
};
