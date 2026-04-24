/**
 * 机器 DSL 到预览 HTML 的生成器
 * 生成带有 data-dsl-id 的 HTML 用于浏览器插件编辑
 *
 * 核心原则：
 * - flex 容器的子节点不设 left/top，由 flex 布局自动排列
 * - 只有 absolute 节点才用 position: relative + left/top
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";

export function generatePreviewHTML(dsl: MachineDSL): string {
  const { page, nodes } = dsl;

  const rootNode = nodes.find(n => n.id === page.id);
  if (!rootNode) throw new Error("Root node not found");

  const nodeMap = new Map<string, DSLNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  const bodyHTML = renderNode(rootNode, nodeMap);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name} - Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      justify-content: center;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .dsl-node { transition: outline 0.15s ease; }
    .dsl-node:hover { outline: 2px solid rgba(59, 130, 246, 0.5); outline-offset: 2px; }
    .dsl-node.selected { outline: 2px solid rgb(59, 130, 246); outline-offset: 2px; }
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}

function renderNode(node: DSLNode, nodeMap: Map<string, DSLNode>): string {
  const tag = getHTMLTag(node);
  const attrs = generateAttributes(node);
  const css = generateCSS(node, nodeMap);
  const styleAttr = css ? ` style="${css}"` : "";

  let content = "";

  // 图片节点：用 img 标签渲染，父容器不设 background-image，避免双层叠加
  // 父容器只负责 border-radius + overflow + 尺寸，img 自己用 object-fit 填充
  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style.objectFit || "cover";
    const onerror = `var p=this.parentElement;p.style.background='linear-gradient(135deg,#e8e8e8 25%,#d0d0d0 50%,#e8e8e8 75%)';this.style.display='none'`;
    // img 填满父容器
    content = `<img src="${escapeAttr(node.content.src)}" alt="${escapeAttr(node.name || '')}" style="display:block; width:100%; height:100%; object-fit:${objectFit};" onerror="${onerror}" />`;
    // 图片节点本身不加 background-image CSS（img 标签负责渲染）
    return `<${tag}${attrs}${styleAttr}>${content}</${tag}>`;
  }

  // 文本内容
  if (node.type === "text" && node.content?.text) {
    content = escapeHTML(node.content.text);
  }

  // 子节点
  if (node.children.length > 0) {
    const childrenHTML = node.children
      .map(id => nodeMap.get(id))
      .filter(Boolean)
      .map(child => renderNode(child!, nodeMap))
      .join("\n");
    content += (content ? "\n" : "") + childrenHTML;
  }

  if (!content) {
    return `<${tag}${attrs}${styleAttr} />`;
  }

  return `<${tag}${attrs}${styleAttr}>${content}</${tag}>`;
}

function getHTMLTag(node: DSLNode): string {
  switch (node.type) {
    case "button": return "button";
    case "text": return "p";
    default: return "div";
  }
}

function generateAttributes(node: DSLNode): string {
  const parts = [
    `class="dsl-node dsl-${node.type}"`,
    `data-dsl-id="${node.id}"`,
    `data-dsl-type="${node.type}"`,
  ];
  if (node.name) parts.push(`data-dsl-name="${escapeAttr(node.name)}"`);
  return " " + parts.join(" ");
}

/**
 * 生成 CSS 字符串 — 核心逻辑
 * 关键原则：
 * - flex 容器优先用 min-height，content-driven 高度
 * - flex 子节点不需要 position/left/top
 * - 行布局默认 justify-content:center
 * - 文字节点不设 position
 */
function generateCSS(node: DSLNode, nodeMap: Map<string, DSLNode>): string {
  const s: string[] = [];

  const isFlexContainer = node.layout.mode === "flex";
  const isRowFlex = isFlexContainer && node.layout.direction === "row";
  const isColFlex = isFlexContainer && node.layout.direction === "column";
  const hasChildren = node.children.length > 0;
  const parentNode = node.parentId ? nodeMap.get(node.parentId) : null;
  const parentIsFlex = parentNode?.layout.mode === "flex";
  const isImageType = node.type === "image";

  // ========== 布局模式 ==========
  if (isFlexContainer) {
    s.push("display:flex");
    if (node.layout.direction) s.push(`flex-direction:${node.layout.direction}`);

    // 行布局默认居中（如果没设置 justify）
    if (isRowFlex) {
      s.push(`justify-content:${node.layout.justify || "center"}`);
    } else if (node.layout.justify) {
      s.push(`justify-content:${node.layout.justify}`);
    }

    if (node.layout.align) s.push(`align-items:${node.layout.align}`);
    if (node.layout.wrap) s.push(`flex-wrap:${node.layout.wrap}`);
    if (node.layout.gap !== undefined) s.push(`gap:${node.layout.gap}px`);
  }
  // 只有不在 flex 父节点内的 absolute 节点才用 position:left/top
  // 文字节点永远不设 position
  else if (!parentIsFlex && node.type !== "text") {
    s.push("position:relative");
    if (node.layout.x !== undefined) s.push(`left:${node.layout.x}px`);
    if (node.layout.y !== undefined) s.push(`top:${node.layout.y}px`);
  }

  // ========== 尺寸 ==========
  // flex 容器且有子节点 → 用 max-width + min-height，让内容决定高度
  // 纯文字/图片容器或有固定尺寸的 → 用 width/height
  const hasFixedW = node.layout.width !== undefined && node.layout.width !== "auto";
  const hasFixedH = node.layout.height !== undefined && node.layout.height !== "auto";

  if (isFlexContainer && hasChildren && hasFixedW) {
    // flex 容器用 max-width，避免在小屏幕上溢出
    s.push(`max-width:${formatSize(node.layout.width)}`);
    // 有背景或明确高度的容器用 min-height
    if (node.style.background || hasFixedH) {
      s.push(`min-height:${formatSize(node.layout.height)}`);
    } else {
      // 没有背景且没固定高度的 flex 容器，高度由内容决定，不设置 height
    }
  } else if (isImageType) {
    // 图片节点用固定尺寸
    if (hasFixedW) s.push(`width:${formatSize(node.layout.width)}`);
    if (hasFixedH) s.push(`height:${formatSize(node.layout.height)}`);
  } else if (hasFixedW) {
    s.push(`width:${formatSize(node.layout.width)}`);
  }

  // flexShrink
  if (node.layout.flexShrink !== undefined) s.push(`flex-shrink:${node.layout.flexShrink}`);

  // ========== 背景 ==========
  // 图片类型节点（type=image）用 <img> 渲染，不设 background-image
  if (node.type !== "image" && node.style.backgroundImage) {
    s.push(`background-image:url(${node.style.backgroundImage})`);
    s.push("background-size:cover");
    s.push("background-position:center");
    s.push("background-repeat:no-repeat");
  } else if (node.style.background) {
    s.push(`background:${node.style.background}`);
  }

  // ========== 文本 ==========
  if (node.style.color) s.push(`color:${node.style.color}`);
  if (node.style.fontSize) s.push(`font-size:${node.style.fontSize}px`);
  if (node.style.fontFamily) s.push(`font-family:'${node.style.fontFamily}', sans-serif`);
  if (node.style.fontWeight) s.push(`font-weight:${node.style.fontWeight}`);
  if (node.style.lineHeight) s.push(`line-height:${node.style.lineHeight}px`);
  if (node.style.textAlign) s.push(`text-align:${node.style.textAlign}`);

  // ========== 圆角 ==========
  if (node.style.borderRadius) {
    const br = node.style.borderRadius;
    if (br.linked) {
      s.push(`border-radius:${br.topLeft}px`);
    } else {
      s.push(`border-radius:${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`);
    }
  }

  // ========== overflow ==========
  if (node.style.overflow) s.push(`overflow:${node.style.overflow}`);

  // ========== padding ==========
  if (node.style.padding) {
    const p = node.style.padding;
    if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
      s.push(`padding:${p.top}px`);
    } else {
      s.push(`padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
    }
  }

  // ========== margin ==========
  if (node.style.margin) {
    const m = node.style.margin;
    s.push(`margin:${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`);
  }

  // ========== box-shadow ==========
  if (node.style.boxShadow) s.push(`box-shadow:${node.style.boxShadow}`);

  // ========== border ==========
  if (node.style.border) s.push(`border:${node.style.border}`);

  return s.join(";");
}

function formatSize(val: number | string | undefined): string {
  if (val === undefined) return "auto";
  return typeof val === "number" ? `${val}px` : val;
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
