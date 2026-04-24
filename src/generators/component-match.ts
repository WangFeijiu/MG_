/**
 * 组件匹配器
 * 读取组件库文件并匹配 DSL 节点与可复用组件
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentSource, ComponentMatch } from "../types/gen-config.js";
import type { DSLNode } from "../types/machine-dsl.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

/**
 * 读取组件源中的文件
 */
async function readComponentFiles(sources: ComponentSource[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  for (const src of sources) {
    if (src.type === "local") {
      const resolvedPath = resolveLocalPath(src.path);
      if (existsSync(resolvedPath)) {
        await readLocalDir(resolvedPath, files);
      }
    } else if (src.type === "npm") {
      const nodeModulesPath = join(PROJECT_ROOT, "node_modules", src.name);
      if (existsSync(nodeModulesPath)) {
        const searchPaths = src.paths?.map(p => join(nodeModulesPath, p)) || [nodeModulesPath];
        for (const p of searchPaths) {
          if (existsSync(p)) {
            await readLocalDir(p, files);
          }
        }
      }
    }
  }

  return files;
}

/**
 * 递归读取本地目录
 */
async function readLocalDir(dirPath: string, files: Map<string, string>): Promise<void> {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await readLocalDir(fullPath, files);
      } else if (/\.(tsx?|jsx?|vue)$/.test(entry.name)) {
        const name = basename(entry.name, extname(entry.name));
        const content = readFileSync(fullPath, "utf-8");
        files.set(name, content);
      }
    }
  } catch {
    // 忽略读取错误
  }
}

/**
 * 解析本地路径（支持 ~ 和相对路径）
 */
function resolveLocalPath(path: string): string {
  if (path.startsWith("~/")) {
    // 解析为用户 home 目录（这里用项目根目录代替）
    return join(PROJECT_ROOT, path.slice(2));
  } else if (path.startsWith("./")) {
    return join(PROJECT_ROOT, path.slice(2));
  } else if (!path.startsWith("/") && !/^[a-zA-Z]:/.test(path)) {
    // 相对路径
    return join(PROJECT_ROOT, path);
  }
  return path;
}

/**
 * 根据节点特征匹配组件（基于规则匹配）
 */
function matchByRules(node: DSLNode, components: Map<string, string>): ComponentMatch | null {
  const nodeType = node.type?.toLowerCase();
  const nodeName = node.name?.toLowerCase() || "";

  // 组件名称匹配规则
  const rules: Array<{
    patterns: RegExp[];
    componentNames: string[];
  }> = [
    {
      patterns: [/button/, /btn/, /按钮/],
      componentNames: ["Button", "PrimaryButton", "ActionButton"],
    },
    {
      patterns: [/text/, /label/, /标题/, /文字/],
      componentNames: ["Text", "Label", "Typography"],
    },
    {
      patterns: [/input/, /textfield/, /输入/],
      componentNames: ["Input", "TextField", "TextInput"],
    },
    {
      patterns: [/image/, /img/, /图片/, /picture/],
      componentNames: ["Image", "Img", "Picture"],
    },
    {
      patterns: [/card/, /卡片/],
      componentNames: ["Card", "CardContainer"],
    },
    {
      patterns: [/icon/, /图标/],
      componentNames: ["Icon", "IconButton"],
    },
    {
      patterns: [/div/, /container/, /box/, /容器/, /区块/],
      componentNames: ["Box", "Container", "Wrapper", "Div"],
    },
  ];

  for (const rule of rules) {
    const matchesPattern = rule.patterns.some(p => p.test(nodeType) || p.test(nodeName));
    if (matchesPattern) {
      for (const compName of rule.componentNames) {
        if (components.has(compName)) {
          return {
            nodeId: node.id,
            componentName: compName,
            componentPath: compName,
            score: 0.8,
          };
        }
      }
    }
  }

  return null;
}

/**
 * 根据节点 meta.componentHint 匹配
 */
function matchByHint(node: DSLNode, components: Map<string, string>): ComponentMatch | null {
  const hint = node.meta?.componentHint;
  if (hint && components.has(hint)) {
    return {
      nodeId: node.id,
      componentName: hint,
      componentPath: hint,
      score: 1.0,
    };
  }
  return null;
}

/**
 * 匹配所有 DSL 节点与可用组件
 */
export async function matchComponents(
  nodes: DSLNode[],
  sources: ComponentSource[]
): Promise<ComponentMatch[]> {
  if (!sources || sources.length === 0) {
    return [];
  }

  const components = await readComponentFiles(sources);
  if (components.size === 0) {
    return [];
  }

  const matches: ComponentMatch[] = [];

  for (const node of nodes) {
    // 1. 优先使用 meta.componentHint
    const hintMatch = matchByHint(node, components);
    if (hintMatch) {
      matches.push(hintMatch);
      continue;
    }

    // 2. 基于规则匹配
    const ruleMatch = matchByRules(node, components);
    if (ruleMatch) {
      matches.push(ruleMatch);
    }
  }

  return matches;
}

/**
 * 获取匹配的组件导入语句
 */
export function getComponentImports(matches: ComponentMatch[]): string[] {
  const imports = new Set<string>();
  for (const match of matches) {
    imports.add(match.componentName);
  }
  return Array.from(imports);
}

/**
 * 判断节点是否有匹配的组件
 */
export function hasMatch(nodeId: string, matches: ComponentMatch[]): boolean {
  return matches.some(m => m.nodeId === nodeId);
}

/**
 * 获取节点对应的组件名称
 */
export function getMatchedComponent(nodeId: string, matches: ComponentMatch[]): string | null {
  const match = matches.find(m => m.nodeId === nodeId);
  return match?.componentName ?? null;
}
