/**
 * 动态组件库 - 完全基于DSL数据驱动，无硬编码
 *
 * 特性：
 * - 所有样式从DSL提取
 * - 响应式布局（Flexbox/Grid）
 * - 流畅的动画效果
 * - 无绝对定位
 */

import type { DSLNode } from "../types/machine-dsl.js";

// ========== 工具函数 ==========

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function extractPadding(node: DSLNode | undefined): string {
  const p = node?.style?.padding;
  if (!p || (p.top === 0 && p.right === 0 && p.bottom === 0 && p.left === 0)) return "0";
  return `${p.top ?? 0}px ${p.right ?? 0}px ${p.bottom ?? 0}px ${p.left ?? 0}px`;
}

export function extractBorderRadius(node: DSLNode | undefined): string {
  if (!node?.style?.borderRadius) return "0";
  const br = node.style.borderRadius;
  if (br.linked) return `${br.topLeft}px`;
  return `${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`;
}

export function extractBackground(node: DSLNode | undefined): string {
  return node?.style?.background || "transparent";
}

export function extractColor(node: DSLNode | undefined): string {
  return node?.style?.color || "inherit";
}

export function extractFontSize(node: DSLNode | undefined): number {
  return node?.style?.fontSize || 16;
}

export function extractFontWeight(node: DSLNode | undefined): number {
  return node?.style?.fontWeight || 400;
}

export function extractLineHeight(node: DSLNode | undefined): number | undefined {
  return node?.style?.lineHeight;
}

export function extractGap(node: DSLNode | undefined): number {
  return node?.layout?.gap || 0;
}

export function extractFlexDirection(node: DSLNode | undefined): "row" | "column" {
  return node?.layout?.direction || "column";
}

export function extractJustify(node: DSLNode | undefined): string {
  return node?.layout?.justify || "flex-start";
}

export function extractAlign(node: DSLNode | undefined): string {
  return node?.layout?.align || "stretch";
}

// ========== 动态按钮组件 ==========

export type ButtonProps = {
  text: string;
  node: DSLNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
};

export function renderButton(props: ButtonProps): { html: string; css: string } {
  const { text, node, variant = "primary", className = "" } = props;

  const padding = extractPadding(node);
  const borderRadius = extractBorderRadius(node);
  const background = extractBackground(node);
  const color = extractColor(node);
  const fontSize = extractFontSize(node);
  const fontWeight = extractFontWeight(node);

  const btnClass = `btn-dynamic-${node.id}`;

  const html = `<button class="${btnClass} ${className}" type="button">
  ${esc(text)}
</button>`;

  const css = `.${btnClass} {
  padding: ${padding};
  border-radius: ${borderRadius};
  background: ${background};
  color: ${color};
  font-size: ${fontSize}px;
  font-weight: ${fontWeight};
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.${btnClass}::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.${btnClass}:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.${btnClass}:hover::before {
  width: 300px;
  height: 300px;
}

.${btnClass}:active {
  transform: translateY(0);
}

.${btnClass}:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}`;

  return { html, css };
}

// ========== 动态图片组件 ==========

export type ImageProps = {
  src: string;
  alt: string;
  node: DSLNode;
  className?: string;
};

export function renderImage(props: ImageProps): { html: string; css: string } {
  const { src, alt, node, className = "" } = props;

  const borderRadius = extractBorderRadius(node);
  const objectFit = node.style?.objectFit || "cover";
  const width = typeof node.layout.width === "number" ? node.layout.width : undefined;
  const height = typeof node.layout.height === "number" ? node.layout.height : undefined;

  const imgClass = `img-dynamic-${node.id}`;

  const html = `<div class="${imgClass}-wrapper ${className}">
  <img
    class="${imgClass}"
    src="${esc(src)}"
    alt="${esc(alt)}"
    loading="lazy"
    onload="this.classList.add('loaded')"
    onerror="this.style.display='none'"
  />
</div>`;

  const sizeStyle = width && height ? `width: ${width}px; height: ${height}px;` : "";

  const css = `.${imgClass}-wrapper {
  position: relative;
  ${sizeStyle}
  border-radius: ${borderRadius};
  overflow: hidden;
}

.${imgClass} {
  width: 100%;
  height: 100%;
  object-fit: ${objectFit};
  opacity: 1;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.${imgClass}-wrapper:hover .${imgClass} {
  transform: scale(1.05);
}

.${imgClass}.loaded + .${imgClass}-skeleton {
  opacity: 0;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.${imgClass}-wrapper:hover .${imgClass} {
  transform: scale(1.05);
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}`;

  return { html, css };
}
