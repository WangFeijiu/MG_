/**
 * 机器 DSL 到 React 代码生成器
 * 生成高还原度的 React 组件代码
 */

import type { MachineDSL, DSLNode, BorderRadius, Spacing } from "../types/machine-dsl.js";

/**
 * 生成 React 组件代码
 */
export function generateReactCode(dsl: MachineDSL): string {
  const { page, nodes } = dsl;

  // 找到根节点
  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) {
    throw new Error("Root node not found");
  }

  // 构建节点映射
  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // 生成组件代码
  const componentName = toPascalCase(page.name);
  const jsx = renderNodeToJSX(rootNode, nodeMap, 2);

  return `import React from 'react';

export function ${componentName}() {
  return (
${jsx}
  );
}

export default ${componentName};
`;
}

/**
 * 渲染节点为 JSX
 */
function renderNodeToJSX(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  indent: number = 0
): string {
  const indentStr = "  ".repeat(indent);

  // 选择 HTML 元素或组件
  const tag = getJSXTag(node);

  // 生成样式对象
  const styleObj = generateStyleObject(node);

  // 生成 JSX 属性
  const attributes = generateJSXAttributes(node, styleObj);

  // 生成内容
  let content = "";

  // 文本内容
  if (node.content?.text) {
    content = node.content.text;
  }

  // 图片内容
  if (node.content?.src) {
    content = `\n${indentStr}  <img src="${node.content.src}" alt="${node.name || ''}" style={{ width: '100%', height: '100%', objectFit: '${node.style.objectFit || 'cover'}' }} />\n${indentStr}`;
  }

  // 子节点
  if (node.children.length > 0) {
    const childrenJSX = node.children
      .map(childId => {
        const childNode = nodeMap.get(childId);
        return childNode ? renderNodeToJSX(childNode, nodeMap, indent + 1) : "";
      })
      .filter(Boolean)
      .join("\n");

    if (childrenJSX) {
      content += `\n${childrenJSX}\n${indentStr}`;
    }
  }

  // 如果没有内容，使用自闭合标签
  if (!content) {
    return `${indentStr}<${tag}${attributes} />`;
  }

  return `${indentStr}<${tag}${attributes}>${content}</${tag}>`;
}

/**
 * 获取 JSX 标签
 */
function getJSXTag(node: DSLNode): string {
  // 如果有组件提示，使用组件
  if (node.meta?.componentHint) {
    return node.meta.componentHint;
  }

  switch (node.type) {
    case "button":
      return "button";
    case "text":
      return "p";
    case "image":
      return "div";
    default:
      return "div";
  }
}

/**
 * 生成 JSX 属性
 */
function generateJSXAttributes(node: DSLNode, styleObj: Record<string, any>): string {
  const attrs: string[] = [];

  // className
  attrs.push(`className="${node.type}"`);

  // style
  if (Object.keys(styleObj).length > 0) {
    const styleStr = JSON.stringify(styleObj, null, 0);
    attrs.push(`style={${styleStr}}`);
  }

  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}

/**
 * 生成样式对象
 */
function generateStyleObject(node: DSLNode): Record<string, any> {
  const style: Record<string, any> = {};

  // 布局模式
  if (node.layout.mode === "flex") {
    style.display = "flex";
    if (node.layout.direction) {
      style.flexDirection = node.layout.direction;
    }
    if (node.layout.justify) {
      style.justifyContent = node.layout.justify;
    }
    if (node.layout.align) {
      style.alignItems = node.layout.align;
    }
    if (node.layout.gap !== undefined) {
      style.gap = `${node.layout.gap}px`;
    }
  } else {
    style.position = "relative";
  }

  // 位置和尺寸
  if (node.layout.x !== undefined) {
    style.left = `${node.layout.x}px`;
  }
  if (node.layout.y !== undefined) {
    style.top = `${node.layout.y}px`;
  }
  if (node.layout.width !== undefined) {
    style.width = typeof node.layout.width === "number"
      ? `${node.layout.width}px`
      : node.layout.width;
  }
  if (node.layout.height !== undefined) {
    style.height = typeof node.layout.height === "number"
      ? `${node.layout.height}px`
      : node.layout.height;
  }

  // 背景
  if (node.style.background) {
    if (node.style.background.startsWith("http")) {
      style.backgroundImage = `url(${node.style.background})`;
      style.backgroundSize = "cover";
      style.backgroundPosition = "center";
    } else {
      style.background = node.style.background;
    }
  }

  // 文本样式
  if (node.style.color) {
    style.color = node.style.color;
  }
  if (node.style.fontSize) {
    style.fontSize = `${node.style.fontSize}px`;
  }
  if (node.style.fontWeight) {
    style.fontWeight = node.style.fontWeight;
  }
  if (node.style.lineHeight) {
    style.lineHeight = `${node.style.lineHeight}px`;
  }

  // 圆角
  if (node.style.borderRadius) {
    const br = node.style.borderRadius;
    if (br.linked) {
      style.borderRadius = `${br.topLeft}px`;
    } else {
      style.borderRadius = `${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`;
    }
  }

  // overflow
  if (node.style.overflow) {
    style.overflow = node.style.overflow;
  }

  // padding
  if (node.style.padding) {
    const p = node.style.padding;
    style.padding = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
  }

  // margin
  if (node.style.margin) {
    const m = node.style.margin;
    style.margin = `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`;
  }

  // boxShadow
  if (node.style.boxShadow) {
    style.boxShadow = node.style.boxShadow;
  }

  // border
  if (node.style.border) {
    style.border = node.style.border;
  }

  return style;
}

/**
 * 转换为 PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
