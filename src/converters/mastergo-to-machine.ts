/**
 * MasterGo DSL 到机器 DSL 的转换器
 * 关键：保留所有布局属性，不丢失任何信息
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";

// MasterGo DSL 类型定义
type MasterGoDSL = {
  dsl: {
    styles: Record<string, any>;
    nodes: MasterGoNode[];
    components: any[];
  };
};

type MasterGoNode = {
  type: "FRAME" | "GROUP" | "LAYER" | "TEXT";
  id: string;
  name: string;
  layoutStyle: {
    width: number;
    height: number;
    relativeX: number;
    relativeY: number;
  };
  children?: MasterGoNode[];
  flexContainerInfo?: {
    flexDirection?: "row" | "column";
    alignItems?: string;
    justifyContent?: string;
    flexWrap?: string;
    gap?: string;
    mainSizing?: string;
    crossSizing?: string;
    padding?: string;
  };
  flexShrink?: number;
  fill?: string;
  effect?: string;
  text?: Array<{ text: string; font: string }>;
  textColor?: Array<{ start: number; end: number; color: string }>;
  textAlign?: string;
  textMode?: string;
  borderRadius?: string;
  strokeColor?: string;
  strokeType?: string;
  strokeAlign?: string;
  strokeWidth?: string;
};

/**
 * 转换 MasterGo DSL 到机器 DSL
 */
export function convertMasterGoToMachine(masterGoDSL: MasterGoDSL): MachineDSL {
  const { dsl } = masterGoDSL;
  const { styles, nodes } = dsl;

  const rootNode = nodes[0];
  if (!rootNode) {
    throw new Error("No root node found in MasterGo DSL");
  }

  const machineDSL: MachineDSL = {
    page: {
      id: rootNode.id,
      name: rootNode.name,
      width: rootNode.layoutStyle.width,
      height: rootNode.layoutStyle.height,
    },
    nodes: [],
  };

  const convertedNodes: DSLNode[] = [];

  function convertNode(
    mgNode: MasterGoNode,
    parentId: string | null = null
  ): DSLNode {
    const isFlexChild = parentId !== null;
    const parentDSL = parentId ? convertedNodes.find(n => n.id === parentId) : null;
    const parentIsFlex = parentDSL?.layout.mode === "flex";

    const dslNode: DSLNode = {
      id: mgNode.id,
      type: mgNode.type === "TEXT" ? "text" : "container",
      name: mgNode.name,
      parentId,
      children: [],
      layout: {},
      style: {},
      meta: {
        sourceNodeId: mgNode.id,
        semanticType: classifyNodeSemantic(mgNode),
      },
    };

    // === 布局处理 ===

    // 智能判断是否应该使用 flex 布局
    if (mgNode.flexContainerInfo && shouldUseFlex(mgNode)) {
      // 这个节点本身是 flex 容器
      dslNode.layout.mode = "flex";
      dslNode.layout.direction = mgNode.flexContainerInfo.flexDirection || "row";

      if (mgNode.flexContainerInfo.alignItems) {
        dslNode.layout.align = mgNode.flexContainerInfo.alignItems;
      }
      if (mgNode.flexContainerInfo.justifyContent) {
        dslNode.layout.justify = mgNode.flexContainerInfo.justifyContent;
      }
      if (mgNode.flexContainerInfo.flexWrap) {
        dslNode.layout.wrap = mgNode.flexContainerInfo.flexWrap;
      }
      if (mgNode.flexContainerInfo.gap) {
        dslNode.layout.gap = parseGap(mgNode.flexContainerInfo.gap);
      }

      // padding
      if (mgNode.flexContainerInfo.padding) {
        dslNode.style.padding = parsePadding(mgNode.flexContainerInfo.padding);
      }
    } else {
      dslNode.layout.mode = "absolute";
    }

    // 尺寸 — flex 子节点不一定需要 left/top
    // 但 absolute 模式下需要
    if (dslNode.layout.mode === "absolute" || !parentIsFlex) {
      dslNode.layout.x = mgNode.layoutStyle.relativeX;
      dslNode.layout.y = mgNode.layoutStyle.relativeY;
    }

    dslNode.layout.width = mgNode.layoutStyle.width;
    dslNode.layout.height = mgNode.layoutStyle.height;

    // flexShrink
    if (mgNode.flexShrink !== undefined) {
      dslNode.layout.flexShrink = mgNode.flexShrink;
    }

    // === 样式处理 ===

    // fill（背景色或图片）
    if (mgNode.fill) {
      const fillValue = resolveStyle(styles, mgNode.fill);
      if (fillValue) {
        if (fillValue.startsWith("http")) {
          dslNode.style.backgroundImage = fillValue;
        } else {
          dslNode.style.background = fillValue;
        }
      }
    }

    // 圆角
    if (mgNode.borderRadius) {
      dslNode.style.borderRadius = parseBorderRadius(mgNode.borderRadius);
      dslNode.style.overflow = "hidden";
    }

    // stroke（边框）
    if (mgNode.strokeColor && mgNode.strokeWidth) {
      const strokeColor = resolveStyle(styles, mgNode.strokeColor);
      const strokeW = parseFloat(mgNode.strokeWidth) || 1;
      if (strokeColor) {
        dslNode.style.border = `${strokeW}px solid ${strokeColor}`;
      }
    }

    // === 文本处理 ===
    if (mgNode.text && mgNode.text.length > 0) {
      dslNode.content = {
        text: mgNode.text.map(t => t.text).join(""),
      };

      // 文本颜色
      if (mgNode.textColor && mgNode.textColor.length > 0) {
        const color = resolveStyle(styles, mgNode.textColor[0].color);
        if (color) {
          dslNode.style.color = color;
        }
      }

      // 字体样式
      if (mgNode.text[0].font) {
        const fontStyle = styles[mgNode.text[0].font];
        if (fontStyle?.value) {
          dslNode.style.fontSize = fontStyle.value.size;
          dslNode.style.fontFamily = fontStyle.value.family;

          const lh = fontStyle.value.lineHeight;
          if (lh && lh !== "auto") {
            dslNode.style.lineHeight = parseFloat(lh);
          }

          // 解析 fontWeight 从 style JSON 字符串
          const styleObj = parseFontStyle(fontStyle.value.style);
          if (styleObj.fontWeight) {
            dslNode.style.fontWeight = styleObj.fontWeight;
          }
        }
      }

      // textAlign
      if (mgNode.textAlign) {
        dslNode.style.textAlign = mgNode.textAlign;
      }
    }

    // === LAYER 有 fill 图片 → 当作 image ===
    if (mgNode.type === "LAYER" && mgNode.fill) {
      const fillValue = resolveStyle(styles, mgNode.fill);
      if (fillValue && fillValue.startsWith("http")) {
        dslNode.type = "image";
        dslNode.content = { src: fillValue };
      }
    }

    // === 递归子节点 ===
    if (mgNode.children) {
      dslNode.children = mgNode.children.map(child => child.id);

      for (const child of mgNode.children) {
        const childNode = convertNode(child, mgNode.id);
        convertedNodes.push(childNode);
      }
    }

    return dslNode;
  }

  const rootDSLNode = convertNode(rootNode);
  convertedNodes.unshift(rootDSLNode);

  machineDSL.nodes = convertedNodes;

  return machineDSL;
}

/**
 * 映射节点类型
 */
function mapNodeType(mgType: string, styles: Record<string, any>): DSLNode["type"] {
  switch (mgType) {
    case "TEXT":
      return "text";
    case "FRAME":
      return "container";
    case "GROUP":
      return "container";
    case "LAYER":
      return "container";
    default:
      return "container";
  }
}

/**
 * 样式 Token 类型
 */
type StyleToken = {
  type: "solid" | "gradient" | "image" | "none";
  value: string;
  metadata?: {
    gradientType?: "linear" | "radial";
    filename?: string;
  };
};

/**
 * 解析样式引用（增强版 - 支持类型推断）
 */
function resolveStyle(styles: Record<string, any>, styleRef: string): string {
  const token = resolveStyleToken(styles, styleRef);
  return token.value;
}

/**
 * 解析样式引用为结构化 Token
 */
function resolveStyleToken(styles: Record<string, any>, styleRef: string): StyleToken {
  const style = styles[styleRef];
  if (!style?.value) {
    return { type: "none", value: "" };
  }

  const value = style.value;

  // 数组类型（可能是多个填充）
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "none", value: "" };
    }

    const firstValue = value[0];

    // 图片类型
    if (typeof firstValue === "object" && firstValue.url) {
      return {
        type: "image",
        value: firstValue.url,
        metadata: {
          filename: extractFilename(firstValue.url),
        },
      };
    }

    // 纯色字符串
    if (typeof firstValue === "string") {
      return parseColorOrGradient(firstValue);
    }
  }

  // 字符串类型
  if (typeof value === "string") {
    return parseColorOrGradient(value);
  }

  return { type: "none", value: "" };
}

/**
 * 解析颜色或渐变
 */
function parseColorOrGradient(value: string): StyleToken {
  // 渐变检测
  if (value.includes("linear-gradient") || value.includes("radial-gradient")) {
    return {
      type: "gradient",
      value,
      metadata: {
        gradientType: value.includes("radial") ? "radial" : "linear",
      },
    };
  }

  // 纯色
  if (
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("rgba") ||
    value.startsWith("hsla")
  ) {
    return { type: "solid", value };
  }

  // 其他情况当作纯色
  return { type: "solid", value };
}

/**
 * 从 URL 提取文件名
 */
function extractFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split("/");
    return parts[parts.length - 1] || "image.jpg";
  } catch {
    return "image.jpg";
  }
}

/**
 * 节点语义分类
 */
function classifyNodeSemantic(mgNode: MasterGoNode): string {
  const name = mgNode.name.toLowerCase();

  // 按钮检测
  if (
    name.includes("button") ||
    name.includes("btn") ||
    name.includes("submit") ||
    name.includes("confirm") ||
    name.includes("cancel")
  ) {
    return "button";
  }

  // 输入框检测
  if (
    name.includes("input") ||
    name.includes("field") ||
    name.includes("textbox") ||
    name.includes("search")
  ) {
    return "input";
  }

  // 卡片检测
  if (
    name.includes("card") ||
    name.includes("panel") ||
    name.includes("box")
  ) {
    return "card";
  }

  // 头像检测
  if (
    name.includes("avatar") ||
    name.includes("profile") ||
    name.includes("user")
  ) {
    return "avatar";
  }

  // 徽章检测
  if (
    name.includes("badge") ||
    name.includes("tag") ||
    name.includes("label") ||
    name.includes("chip")
  ) {
    return "badge";
  }

  // 图标检测
  if (
    name.includes("icon") ||
    name.includes("ico") ||
    name.includes("symbol")
  ) {
    return "icon";
  }

  // 导航栏检测
  if (
    name.includes("nav") ||
    name.includes("navbar") ||
    name.includes("header") ||
    name.includes("topbar")
  ) {
    return "navbar";
  }

  // 侧边栏检测
  if (
    name.includes("sidebar") ||
    name.includes("aside") ||
    name.includes("menu")
  ) {
    return "sidebar";
  }

  // 页脚检测
  if (name.includes("footer") || name.includes("bottom")) {
    return "footer";
  }

  // 列表检测
  if (name.includes("list") || name.includes("item")) {
    return "list";
  }

  // 模态框检测
  if (
    name.includes("modal") ||
    name.includes("dialog") ||
    name.includes("popup")
  ) {
    return "modal";
  }

  // 下拉菜单检测
  if (
    name.includes("dropdown") ||
    name.includes("select") ||
    name.includes("picker")
  ) {
    return "dropdown";
  }

  // 标签页检测
  if (name.includes("tab") || name.includes("tabs")) {
    return "tab";
  }

  // 默认
  if (mgNode.type === "TEXT") {
    return "text";
  }

  return "container";
}

/**
 * 智能判断是否应该使用 flex 布局
 */
function shouldUseFlex(mgNode: MasterGoNode): boolean {
  if (!mgNode.flexContainerInfo) return false;
  if (!mgNode.children || mgNode.children.length < 2) return false;

  const children = mgNode.children;

  // 检查子节点是否有规律排列
  const yPositions = children.map(c => c.layoutStyle.relativeY);
  const xPositions = children.map(c => c.layoutStyle.relativeX);

  // 计算 Y 坐标的平均值和最大偏差
  const avgY = yPositions.reduce((a, b) => a + b, 0) / yPositions.length;
  const maxYDeviation = Math.max(...yPositions.map(y => Math.abs(y - avgY)));

  // 计算 X 坐标的平均值和最大偏差
  const avgX = xPositions.reduce((a, b) => a + b, 0) / xPositions.length;
  const maxXDeviation = Math.max(...xPositions.map(x => Math.abs(x - avgX)));

  // 如果 Y 坐标偏差小于 10px，认为是行对齐（水平排列）
  if (maxYDeviation < 10) {
    // 检查 X 坐标是否递增（从左到右排列）
    const isIncreasing = xPositions.every((x, i) => i === 0 || x >= xPositions[i - 1] - 5);
    if (isIncreasing) {
      return true; // 明确的行排列
    }
  }

  // 如果 X 坐标偏差小于 10px，认为是列对齐（垂直排列）
  if (maxXDeviation < 10) {
    // 检查 Y 坐标是否递增（从上到下排列）
    const isIncreasing = yPositions.every((y, i) => i === 0 || y >= yPositions[i - 1] - 5);
    if (isIncreasing) {
      return true; // 明确的列排列
    }
  }

  // 检查是否是网格布局
  if (isGridPattern(children)) {
    return true;
  }

  // 如果子节点数量很多（>= 3）且有 flexContainerInfo，倾向于使用 flex
  if (children.length >= 3) {
    return true;
  }

  // 默认不使用 flex（使用 absolute）
  return false;
}

/**
 * 检查是否是网格布局模式
 */
function isGridPattern(children: MasterGoNode[]): boolean {
  if (children.length < 4) return false;

  // 按 Y 坐标分组（行）
  const rowGroups = new Map<number, MasterGoNode[]>();
  for (const child of children) {
    const y = Math.round(child.layoutStyle.relativeY / 10) * 10; // 10px 容差
    if (!rowGroups.has(y)) {
      rowGroups.set(y, []);
    }
    rowGroups.get(y)!.push(child);
  }

  // 检查每行是否有相同数量的元素
  const rowSizes = Array.from(rowGroups.values()).map(row => row.length);
  const allSame = rowSizes.every(size => size === rowSizes[0]);

  // 如果有至少 2 行，每行至少 2 个元素，且每行元素数量相同，认为是网格
  return allSame && rowGroups.size >= 2 && rowSizes[0] >= 2;
}

/**
 * 解析圆角
 */
function parseBorderRadius(radius: string): BorderRadius {
  const value = parseFloat(radius);
  return {
    linked: true,
    topLeft: value,
    topRight: value,
    bottomRight: value,
    bottomLeft: value,
  };
}

/**
 * 解析 gap（可能是 "24px" 或 "24px 80px"）
 */
function parseGap(gapStr: string): number {
  // 取第一个值作为 gap（row gap）
  const parts = gapStr.split(/\s+/);
  return parseFloat(parts[0]) || 0;
}

/**
 * 解析 padding（如 "80px 0px"）
 */
function parsePadding(paddingStr: string): Spacing {
  const parts = paddingStr.split(/\s+/).map(v => parseFloat(v) || 0);

  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }
  if (parts.length === 4) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * 解析 font style JSON（如 '{"fontStyle":"SemiBold","opsz":"auto"}'）
 */
function parseFontStyle(styleStr: string): { fontWeight?: number } {
  try {
    const obj = JSON.parse(styleStr);
    const fontStyle = obj.fontStyle;
    if (!fontStyle) return {};

    const weightMap: Record<string, number> = {
      "Thin": 100,
      "ExtraLight": 200,
      "Light": 300,
      "Regular": 400,
      "Medium": 500,
      "SemiBold": 600,
      "Bold": 700,
      "ExtraBold": 800,
      "Black": 900,
    };

    return { fontWeight: weightMap[fontStyle] || 400 };
  } catch {
    return {};
  }
}
