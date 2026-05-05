/**
 * React 组件渲染器 — DSL + 组件识别 → Tailwind TSX
 *
 * 对每个 Section 生成:
 * - 识别的组件 → <Button variant="primary"> / <Card> / <Grid> / ...
 * - text 节点 → <p className="text-base text-gray-800">
 * - image 节点 → <ResponsiveImage src="..." className="w-full object-cover" />
 * - 未识别容器 → <div className="flex items-center gap-4">
 *
 * 全部使用 Tailwind utility classes, 不生成 CSS 文件
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { ComponentRecognition } from "./component-recognizer.js";
import { splitSections, type Section } from "./section-splitter.js";
import { mapComponent, collectImports, getUsedComponents } from "./component-mapper.js";
import {
  sizeToTailwind, fontSizeToTailwind, fontWeightToTailwind,
  borderRadiusToTailwind, parseBackgroundToTailwind, parseColorToTailwind,
  tailwindJustify, tailwindAlign, gapToTailwind,
} from "./tailwind-utils.js";

export type ReactComponentOutput = {
  appTSX: string;
  sections: { fileName: string; code: string }[];
  componentCoverage: {
    mappedComponents: number;
    totalComponents: number;
    coverage: number;
  };
};

export function renderReactComponents(
  dsl: MachineDSL,
  recognitions: ComponentRecognition[],
  nodeMap: Map<string, DSLNode>,
): ReactComponentOutput {
  const sections = splitSections(dsl);
  const recognitionMap = new Map<string, ComponentRecognition>();
  for (const r of recognitions) recognitionMap.set(r.nodeId, r);

  const used = getUsedComponents(recognitions);
  const sectionOutputs: { fileName: string; code: string }[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionRoot = nodeMap.get(section.nodeId);
    if (!sectionRoot) continue;

    const componentName = toSectionComponentName(section.name, i);
    const fileName = `${componentName}.tsx`;

    // 收集 section 内用到的组件 imports
    const sectionImports = new Map<string, string>();
    collectSectionImports(sectionRoot, nodeMap, recognitionMap, sectionImports);

    // 生成 JSX
    const jsx = renderNode(sectionRoot, nodeMap, recognitionMap, sectionImports, 4);

    // 构建 import 语句
    const importLines = buildImportLines(sectionImports);
    const hasResponsiveImage = jsx.includes("ResponsiveImage");
    const allImports = hasResponsiveImage
      ? [...importLines, `import { ResponsiveImage } from "@/components/ui/responsive-image";`]
      : importLines;

    const code = `import React from 'react';
${allImports.join("\n")}

export function ${componentName}() {
  return (
${jsx}
  );
}

export default ${componentName};
`;

    sectionOutputs.push({ fileName, code });
  }

  // App.tsx
  const appImports = sectionOutputs.map(s => {
    const name = s.fileName.replace(".tsx", "");
    return `import { ${name} } from './sections/${name}';`;
  }).join("\n");

  const sectionJSX = sectionOutputs.map(s => {
    const name = s.fileName.replace(".tsx", "");
    return `      <${name} />`;
  }).join("\n");

  const appTSX = `import React from 'react';
${appImports}

export function App() {
  return (
    <div className="min-h-screen">
${sectionJSX}
    </div>
  );
}

export default App;
`;

  return {
    appTSX,
    sections: sectionOutputs,
    componentCoverage: {
      mappedComponents: used.mapped,
      totalComponents: used.total,
      coverage: used.total > 0 ? used.mapped / used.total : 0,
    },
  };
}

// ========== 渲染节点 ==========

function renderNode(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  recognitionMap: Map<string, ComponentRecognition>,
  sectionImports: Map<string, string>,
  indent: number,
): string {
  const indentStr = "  ".repeat(indent);
  const rec = recognitionMap.get(node.id);

  // 1. 识别为有效组件 → 使用 mapped component
  if (rec) {
    const mapping = mapComponent(rec);
    if (mapping) {
      sectionImports.set(mapping.componentName, mapping.importPath);
      return renderMappedComponent(node, mapping, nodeMap, recognitionMap, sectionImports, indent);
    }
  }

  // 2. text 节点
  if (node.type === "text") {
    return renderText(node, indent);
  }

  // 3. image 节点
  if (node.type === "image") {
    return renderImage(node, indent);
  }

  // 4. icon 节点
  if (node.type === "icon") {
    return renderIcon(node, indent);
  }

  // 5. 容器 (section/container/stack/unknown)
  return renderContainer(node, nodeMap, recognitionMap, sectionImports, indent);
}

function renderMappedComponent(
  node: DSLNode,
  mapping: { componentName: string; extractProps: (node: DSLNode) => Record<string, string | number | boolean> },
  nodeMap: Map<string, DSLNode>,
  recognitionMap: Map<string, ComponentRecognition>,
  sectionImports: Map<string, string>,
  indent: number,
): string {
  const indentStr = "  ".repeat(indent);
  const props = mapping.extractProps(node);
  const propStr = Object.entries(props)
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}="${v}"`;
      if (typeof v === "boolean") return v ? k : "";
      return `${k}={${JSON.stringify(v)}}`;
    })
    .filter(Boolean)
    .join(" ");

  const className = buildTailwindClasses(node);

  const children = node.children
    .map(id => nodeMap.get(id))
    .filter(Boolean)
    .map(child => renderNode(child!, nodeMap, recognitionMap, sectionImports, indent + 1))
    .join("\n");

  const textContent = node.type === "text" && node.content?.text
    ? escapeJSXText(node.content.text)
    : "";

  if (children || textContent) {
    const content = [textContent, children].filter(Boolean).join("\n");
    const allAttrs = [propStr, className ? `className="${className}"` : ""].filter(Boolean).join(" ");
    return `${indentStr}<${mapping.componentName}${allAttrs ? " " + allAttrs : ""}>\n${content}\n${indentStr}</${mapping.componentName}>`;
  }

  const allAttrs = [propStr, className ? `className="${className}"` : ""].filter(Boolean).join(" ");
  return `${indentStr}<${mapping.componentName}${allAttrs ? " " + allAttrs : ""} />`;
}

function renderText(node: DSLNode, indent: number): string {
  const indentStr = "  ".repeat(indent);
  const text = node.content?.text ?? "";
  if (!text.trim()) return "";

  const classes = buildTextClasses(node);
  const tag = inferTextTag(node);

  return `${indentStr}<${tag} className="${classes}">${escapeJSXText(text)}</${tag}>`;
}

function renderImage(node: DSLNode, indent: number): string {
  const indentStr = "  ".repeat(indent);
  const src = node.content?.src ?? "";
  const alt = node.name ?? "";
  const classes = buildImageClasses(node);

  return `${indentStr}<ResponsiveImage src="${escapeJSXAttr(src)}" alt="${escapeJSXAttr(alt)}" className="${classes}" />`;
}

function renderIcon(node: DSLNode, indent: number): string {
  const indentStr = "  ".repeat(indent);
  const w = typeof node.layout.width === "number" ? node.layout.width : 24;
  const sizeClass = w <= 16 ? "w-4 h-4" : w <= 24 ? "w-6 h-6" : w <= 32 ? "w-8 h-8" : "w-10 h-10";

  return `${indentStr}<span className="${sizeClass} inline-block" aria-hidden="true" />`;
}

function renderContainer(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  recognitionMap: Map<string, ComponentRecognition>,
  sectionImports: Map<string, string>,
  indent: number,
): string {
  const indentStr = "  ".repeat(indent);
  const tag = inferContainerTag(node);
  const classes = buildContainerClasses(node);

  const children = node.children
    .map(id => nodeMap.get(id))
    .filter(Boolean)
    .map(child => renderNode(child!, nodeMap, recognitionMap, sectionImports, indent + 1))
    .filter(Boolean)
    .join("\n");

  if (!children) {
    return `${indentStr}<${tag} className="${classes}" />`;
  }

  return `${indentStr}<${tag} className="${classes}">\n${children}\n${indentStr}</${tag}>`;
}

// ========== Tailwind class 生成 ==========

function buildTailwindClasses(node: DSLNode): string {
  const classes: string[] = [];
  const s = node.style ?? {};
  const l = node.layout;

  if (s.background) classes.push(parseBackgroundToTailwind(s.background));
  if (s.borderRadius && typeof s.borderRadius === "number" && s.borderRadius > 0) {
    const r = borderRadiusToTailwind(s.borderRadius);
    if (r) classes.push(`rounded-${r}`);
    else classes.push("rounded");
  }

  return classes.join(" ");
}

function buildTextClasses(node: DSLNode): string {
  const classes: string[] = [];
  const s = node.style ?? {};

  if (s.fontSize && typeof s.fontSize === "number") {
    const fs = fontSizeToTailwind(s.fontSize);
    classes.push(fs === "base" ? "text-base" : `text-${fs}`);
  }
  if (s.fontWeight) {
    const fw = fontWeightToTailwind(s.fontWeight);
    if (fw !== "normal") classes.push(`font-${fw}`);
  }
  if (s.color) classes.push(parseColorToTailwind(s.color));
  if (s.lineHeight && typeof s.lineHeight === "number" && s.lineHeight > 1.5) {
    classes.push("leading-relaxed");
  }

  if (classes.length === 0) classes.push("text-base");
  return classes.join(" ");
}

function buildImageClasses(node: DSLNode): string {
  const classes = ["w-full", "object-cover"];
  const s = node.style ?? {};

  if (s.borderRadius && typeof s.borderRadius === "number" && s.borderRadius > 0) {
    const r = borderRadiusToTailwind(s.borderRadius);
    if (r) classes.push(`rounded-${r}`);
    else classes.push("rounded");
  }

  return classes.join(" ");
}

function buildContainerClasses(node: DSLNode): string {
  const classes: string[] = [];
  const s = node.style ?? {};
  const l = node.layout;

  // Layout mode
  const display = typeof l.display === "string" ? l.display : "";
  if (display === "flex") {
    classes.push("flex");
    if (l.flexDirection === "column") classes.push("flex-col");
    if (l.justifyContent) {
      const j = tailwindJustify(l.justifyContent);
      if (j) classes.push(j);
    }
    if (l.alignItems) {
      const a = tailwindAlign(l.alignItems);
      if (a) classes.push(a);
    }
    if (typeof l.gap === "number" && l.gap > 0) {
      classes.push(`gap-${gapToTailwind(l.gap)}`);
    }
  } else if (display === "grid") {
    classes.push("grid");
    // Grid details would come from grid-specific analysis
  }

  // Background
  if (s.background) classes.push(parseBackgroundToTailwind(s.background));

  // Padding
  if (typeof s.padding === "number" && s.padding > 0) {
    classes.push(`p-${sizeToTailwind(s.padding)}`);
  } else if (typeof s.padding === "object") {
    const p = s.padding as Record<string, number>;
    if (p.top || p.bottom || p.left || p.right) {
      if (p.top === p.bottom && p.left === p.right && p.top === p.left) {
        classes.push(`p-${sizeToTailwind(p.top ?? 0)}`);
      } else {
        if (p.top) classes.push(`pt-${sizeToTailwind(p.top)}`);
        if (p.bottom) classes.push(`pb-${sizeToTailwind(p.bottom)}`);
        if (p.left) classes.push(`pl-${sizeToTailwind(p.left)}`);
        if (p.right) classes.push(`pr-${sizeToTailwind(p.right)}`);
      }
    }
  }

  // Border radius
  if (s.borderRadius && typeof s.borderRadius === "number" && s.borderRadius > 0) {
    const r = borderRadiusToTailwind(s.borderRadius);
    if (r) classes.push(`rounded-${r}`);
    else classes.push("rounded");
  }

  if (classes.length === 0) classes.push("flex", "flex-col");
  return classes.join(" ");
}

// ========== Tag 推断 ==========

function inferTextTag(node: DSLNode): string {
  const h = typeof node.layout.height === "number" ? node.layout.height : 0;
  const s = node.style ?? {};
  const fs = typeof s.fontSize === "number" ? s.fontSize : 16;
  const fw = typeof s.fontWeight === "number" ? s.fontWeight : 400;

  if (fs >= 24 && fw >= 600) return "h1";
  if (fs >= 20 && fw >= 600) return "h2";
  if (fs >= 18 && fw >= 500) return "h3";
  if (fw >= 600) return "strong";
  return "p";
}

function inferContainerTag(node: DSLNode): string {
  const h = typeof node.layout.height === "number" ? node.layout.height : 0;
  const children = node.children.length;

  if (h >= 200 && children >= 2) return "section";
  if (children >= 3) return "div";
  return "div";
}

// ========== Import 收集 ==========

function collectSectionImports(
  node: DSLNode,
  nodeMap: Map<string, DSLNode>,
  recognitionMap: Map<string, ComponentRecognition>,
  imports: Map<string, string>,
): void {
  const rec = recognitionMap.get(node.id);
  if (rec) {
    const mapping = mapComponent(rec);
    if (mapping) {
      imports.set(mapping.componentName, mapping.importPath);
    }
  }

  if (node.type === "image") {
    // ResponsiveImage handled separately
  }

  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) collectSectionImports(child, nodeMap, recognitionMap, imports);
  }
}

function buildImportLines(imports: Map<string, string>): string[] {
  // Group by importPath
  const byPath = new Map<string, string[]>();
  for (const [name, path] of imports) {
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(name);
  }

  const lines: string[] = [];
  for (const [path, names] of byPath) {
    lines.push(`import { ${names.join(", ")} } from "${path}";`);
  }
  return lines;
}

// ========== 工具函数 ==========

function toSectionComponentName(name: string, idx: number): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(w => /^[a-zA-Z]/.test(w))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");

  if (cleaned.length >= 3) return `${cleaned}Section`;
  return `Section${idx + 1}`;
}

function escapeJSXText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
}

function escapeJSXAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
