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
      },
    };

    // === 布局处理 ===

    if (mgNode.flexContainerInfo) {
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
 * 解析样式引用
 */
function resolveStyle(styles: Record<string, any>, styleRef: string): string {
  const style = styles[styleRef];
  if (!style?.value) return "";

  if (Array.isArray(style.value)) {
    if (typeof style.value[0] === "string") {
      return style.value[0];
    }
    if (style.value[0]?.url) {
      return style.value[0].url;
    }
  }

  return "";
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
