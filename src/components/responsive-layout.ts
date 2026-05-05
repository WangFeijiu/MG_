/**
 * 响应式布局系统 - 完全禁止绝对定位
 *
 * 特性：
 * - 仅使用 Flexbox 和 Grid
 * - 自适应不同屏幕尺寸
 * - 流式布局
 * - 基于DSL数据驱动
 */

import type { DSLNode } from "../types/machine-dsl.js";
import { extractGap, extractFlexDirection, extractJustify, extractAlign, extractPadding } from "./dynamic-components.js";

// ========== 容器组件 ==========

export type ContainerProps = {
  node: DSLNode;
  children: string;
  className?: string;
};

export function renderContainer(props: ContainerProps): { html: string; css: string } {
  const { node, children, className = "" } = props;

  const containerClass = `container-${node.id}`;
  const gap = extractGap(node);
  const direction = extractFlexDirection(node);
  const justify = extractJustify(node);
  const align = extractAlign(node);
  const padding = extractPadding(node);

  const html = `<div class="${containerClass} ${className}">
  ${children}
</div>`;

  const css = `.${containerClass} {
  display: flex;
  flex-direction: ${direction};
  justify-content: ${justify};
  align-items: ${align};
  gap: ${gap}px;
  padding: ${padding};
  width: 100%;
  max-width: 100%;
}

@media (max-width: 1024px) {
  .${containerClass} {
    flex-direction: column;
    gap: ${Math.max(gap * 0.6, 16)}px;
  }
}

@media (max-width: 768px) {
  .${containerClass} {
    padding: 16px;
  }
}`;

  return { html, css };
}

// ========== Grid 布局组件 ==========

export type GridProps = {
  node: DSLNode;
  children: string[];
  columns?: number;
  className?: string;
};

export function renderGrid(props: GridProps): { html: string; css: string } {
  const { node, children, columns = 3, className = "" } = props;

  const gridClass = `grid-${node.id}`;
  const gap = extractGap(node);
  const padding = extractPadding(node);

  const html = `<div class="${gridClass} ${className}">
  ${children.join("\n  ")}
</div>`;

  const css = `.${gridClass} {
  display: grid;
  grid-template-columns: repeat(${columns}, 1fr);
  gap: ${gap}px;
  padding: ${padding};
  width: 100%;
}

@media (max-width: 1024px) {
  .${gridClass} {
    grid-template-columns: repeat(${Math.max(Math.floor(columns / 2), 1)}, 1fr);
  }
}

@media (max-width: 768px) {
  .${gridClass} {
    grid-template-columns: 1fr;
    gap: ${Math.max(gap * 0.6, 16)}px;
  }
}`;

  return { html, css };
}

// ========== Section 容器 ==========

export type SectionProps = {
  node: DSLNode;
  children: string;
  className?: string;
};

export function renderSection(props: SectionProps): { html: string; css: string } {
  const { node, children, className = "" } = props;

  const sectionClass = `section-${node.id}`;
  const padding = extractPadding(node);
  const background = node.style?.background || "transparent";

  const html = `<section class="${sectionClass} ${className}">
  <div class="section-inner">
    ${children}
  </div>
</section>`;

  const css = `.${sectionClass} {
  background: ${background};
  padding: ${padding};
  width: 100%;
}

.${sectionClass} .section-inner {
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}

@media (max-width: 1440px) {
  .${sectionClass} .section-inner {
    padding: 0 24px;
  }
}

@media (max-width: 768px) {
  .${sectionClass} {
    padding: ${Math.max(parseInt(padding) * 0.5, 24)}px 0;
  }
}`;

  return { html, css };
}
