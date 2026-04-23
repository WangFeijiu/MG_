/**
 * 机器 DSL 到预览 HTML 的生成器
 * 生成带有 data-dsl-id 的 HTML 用于浏览器插件编辑
 *
 * 核心原则：
 * - flex 容器的子节点不设 left/top，由 flex 布局自动排列
 * - 只有 absolute 节点才用 position: relative + left/top
 * - 数值取整，避免小数像素
 * - 换行 flex 容器使用 align-content 而非 align-items
 * - text 节点不写死 height
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
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.5;
    }
    .dsl-preview-wrapper {
      display: flex;
      justify-content: center;
      min-height: 100vh;
      background: #f5f5f5;
      padding: 20px;
    }
    .dsl-node { transition: outline 0.15s ease; }
    .dsl-node:hover { outline: 2px solid rgba(59, 130, 246, 0.5); outline-offset: 2px; }
    .dsl-node.selected { outline: 2px solid rgb(59, 130, 246); outline-offset: 2px; }
  </style>
</head>
<body>
<div class="dsl-preview-wrapper">
${bodyHTML}
</div>
</body>
</html>`;
}

function renderNode(node: DSLNode, nodeMap: Map<string, DSLNode>): string {
  const tag = getHTMLTag(node);
  const attrs = generateAttributes(node);
  const css = generateCSS(node, nodeMap);
  const styleAttr = css ? ` style="${css}"` : "";

  // 图片节点：只渲染 <img>，不在 wrapper 上使用 background-image
  //（background-image 改到 generateCSS 中作为 wrapper 背景备用）
  let content = "";

  if (node.type === "image" && node.content?.src) {
    const objectFit = node.style.objectFit || "cover";
    content = `<img src="${escapeAttr(node.content.src)}" alt="${escapeAttr(node.name || "")}" style="display:block;width:100%;height:100%;object-fit:${objectFit};" />`;
  }

  // 文本节点：仅渲染文本，不写死 height
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
 * @param node 当前节点
 * @param nodeMap 节点映射表，用于查找父节点
 */
function generateCSS(node: DSLNode, nodeMap: Map<string, DSLNode>): string {
  const s: string[] = [];

  const isFlexContainer = node.layout.mode === "flex";
  const parentNode = node.parentId ? nodeMap.get(node.parentId) : null;
  const parentIsFlex = parentNode?.layout.mode === "flex";
  const isWrapFlex = isFlexContainer && node.layout.wrap === "wrap";

  // ========== 布局模式 ==========
  if (isFlexContainer) {
    s.push("display:flex");
    if (node.layout.direction) s.push(`flex-direction:${node.layout.direction}`);
    if (node.layout.justify) s.push(`justify-content:${node.layout.justify}`);
    // 换行 flex 用 align-content，普通 flex 用 align-items
    if (isWrapFlex) {
      if (node.layout.align) s.push(`align-content:${node.layout.align}`);
    } else {
      if (node.layout.align) s.push(`align-items:${node.layout.align}`);
    }
    if (node.layout.wrap) s.push(`flex-wrap:${node.layout.wrap}`);
    if (node.layout.gap !== undefined) s.push(`gap:${round(node.layout.gap)}px`);
  }
  // 只有不在 flex 父节点内的 absolute 节点才用 position:left/top
  else if (!parentIsFlex && node.type !== "text") {
    s.push("position:relative");
    if (node.layout.x !== undefined) s.push(`left:${round(node.layout.x)}px`);
    if (node.layout.y !== undefined) s.push(`top:${round(node.layout.y)}px`);
  }

  // ========== 尺寸 ==========
  if (node.layout.width !== undefined) {
    // flex 子节点用 max-width，避免溢出
    if (parentIsFlex) {
      s.push(`max-width:${round(node.layout.width)}px`);
    } else {
      s.push(`width:${round(node.layout.width)}px`);
    }
  }
  // text 节点不写死 height，让内容自然撑开
  if (node.layout.height !== undefined && node.type !== "text") {
    s.push(`height:${round(node.layout.height)}px`);
  }

  // flexShrink
  if (node.layout.flexShrink !== undefined) s.push(`flex-shrink:${node.layout.flexShrink}`);

  // ========== 背景（图片类型不用 background-image） ==========
  if (node.type === "image") {
    // 图片节点不需要 background-image，仅靠 <img> 撑满
    if (node.style.background) s.push(`background:${node.style.background}`);
  } else if (node.style.backgroundImage) {
    s.push(`background-image:url(${node.style.backgroundImage})`);
    s.push("background-size:cover");
    s.push("background-position:center");
    s.push("background-repeat:no-repeat");
  } else if (node.style.background) {
    s.push(`background:${node.style.background}`);
  }

  // ========== 文本 ==========
  if (node.style.color) s.push(`color:${node.style.color}`);
  if (node.style.fontSize) s.push(`font-size:${round(node.style.fontSize)}px`);
  if (node.style.fontFamily) s.push(`font-family:'${node.style.fontFamily}',sans-serif`);
  if (node.style.fontWeight) s.push(`font-weight:${node.style.fontWeight}`);
  if (node.style.lineHeight) s.push(`line-height:${round(node.style.lineHeight)}px`);
  if (node.style.textAlign) s.push(`text-align:${node.style.textAlign}`);

  // ========== 圆角 ==========
  if (node.style.borderRadius) {
    const br = node.style.borderRadius;
    if (br.linked) {
      s.push(`border-radius:${round(br.topLeft)}px`);
    } else {
      s.push(`border-radius:${round(br.topLeft)}px ${round(br.topRight)}px ${round(br.bottomRight)}px ${round(br.bottomLeft)}px`);
    }
  }

  // ========== overflow ==========
  if (node.style.overflow) s.push(`overflow:${node.style.overflow}`);

  // ========== padding ==========
  if (node.style.padding) {
    const p = node.style.padding;
    if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
      s.push(`padding:${round(p.top)}px`);
    } else {
      s.push(`padding:${round(p.top)}px ${round(p.right)}px ${round(p.bottom)}px ${round(p.left)}px`);
    }
  }

  // ========== margin ==========
  if (node.style.margin) {
    const m = node.style.margin;
    s.push(`margin:${round(m.top)}px ${round(m.right)}px ${round(m.bottom)}px ${round(m.left)}px`);
  }

  // ========== box-shadow ==========
  if (node.style.boxShadow) s.push(`box-shadow:${node.style.boxShadow}`);

  // ========== border ==========
  if (node.style.border) s.push(`border:${node.style.border}`);

  return s.join(";");
}

function round(n: number): number {
  return Math.round(n * 100) / 100; // 保留两位小数
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
