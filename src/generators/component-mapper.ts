/**
 * 组件映射器 — v13 ComponentRecognition → React 组件规格
 *
 * 将识别到的 UIComponent (button/card/grid/...) 映射为:
 * - React 组件名 (Button / Card / Grid / ...)
 * - Import 路径 (@/components/ui/button / ...)
 * - Props 提取 (从 DSL node 的视觉属性推导 variant/size/...)
 */

import type { DSLNode } from "../types/machine-dsl.js";
import type { UIComponent, ComponentRecognition } from "./component-recognizer.js";

export type ComponentMapping = {
  component: UIComponent;
  componentName: string;
  importPath: string;
  extractProps: (node: DSLNode) => Record<string, string | number | boolean>;
};

const COMPONENT_LIBRARY: Record<string, ComponentMapping> = {
  button: {
    component: "button",
    componentName: "Button",
    importPath: "@/components/ui/button",
    extractProps: (node) => {
      const h = typeof node.layout.height === "number" ? node.layout.height : 40;
      const bg = node.style?.background ?? "";
      const isLight = bg.includes("#fff") || bg.includes("#ffffff") || bg.includes("rgb(255") || bg === "";
      return {
        variant: isLight ? "outline" : "default",
        size: h > 48 ? "lg" : h < 32 ? "sm" : "default",
      };
    },
  },

  card: {
    component: "card",
    componentName: "Card",
    importPath: "@/components/ui/card",
    extractProps: (node) => {
      const r = node.style?.borderRadius;
      return {
        variant: (r ?? 0) > 16 ? "rounded" : "default",
      };
    },
  },

  grid: {
    component: "grid",
    componentName: "Grid",
    importPath: "@/components/ui/grid",
    extractProps: (node) => {
      return {
        columns: "auto",
        gap: 4,
      };
    },
  },

  "card-list": {
    component: "card-list",
    componentName: "CardList",
    importPath: "@/components/ui/card-list",
    extractProps: () => ({
      direction: "vertical",
      gap: 4,
    }),
  },

  accordion: {
    component: "accordion",
    componentName: "Accordion",
    importPath: "@/components/ui/accordion",
    extractProps: () => ({
      type: "single",
    }),
  },

  link: {
    component: "link",
    componentName: "Link",
    importPath: "@/components/ui/link",
    extractProps: (node) => ({
      href: "#",
      underline: "hover",
    }),
  },
};

export function mapComponent(recognition: ComponentRecognition): ComponentMapping | null {
  return COMPONENT_LIBRARY[recognition.component] ?? null;
}

export function collectImports(recognitions: ComponentRecognition[]): Map<string, string> {
  const imports = new Map<string, string>(); // componentName → importPath
  for (const rec of recognitions) {
    const mapping = COMPONENT_LIBRARY[rec.component];
    if (mapping) {
      imports.set(mapping.componentName, mapping.importPath);
    }
  }
  return imports;
}

export function getUsedComponents(recognitions: ComponentRecognition[]): { total: number; mapped: number } {
  let mapped = 0;
  for (const rec of recognitions) {
    if (COMPONENT_LIBRARY[rec.component]) mapped++;
  }
  return { total: recognitions.length, mapped };
}
