/**
 * 智能修复策略生成器 v2
 *
 * 针对模板渲染器的特点，生成能够真正影响HTML输出的修复策略
 *
 * 核心思路：
 * 1. 模板渲染器使用DSL中的数据属性（颜色、字体、padding等），而非layout结构
 * 2. 因此修复策略应该针对这些数据属性，而不是layout.direction等
 * 3. 通过分析差异区域，精确定位需要修改的节点和属性
 */

import type { PNG } from "pngjs";
import type { DSLNode } from "../types/machine-dsl.js";
import type { DiffAnalysis } from "./auto-optimizer.js";

export type SmartFix = {
  type: "update-padding" | "update-margin" | "update-background" | "update-fontSize" | "update-color" | "update-width" | "update-height";
  nodeId: string;
  description: string;
  payload: any;
  confidence: number; // 0-1，表示修复的置信度
};

/**
 * 生成智能修复策略
 */
export function generateSmartFixes(
  analysis: DiffAnalysis,
  sectionRoot: DSLNode,
  nodeMap: Map<string, DSLNode>,
  baseline: PNG,
  screenshot: PNG,
): SmartFix[] {
  const fixes: SmartFix[] = [];

  // 1. 尺寸差异 - 最高优先级
  if (Math.abs(baseline.width - screenshot.width) > 10) {
    fixes.push({
      type: "update-width",
      nodeId: sectionRoot.id,
      description: `调整Section宽度: ${baseline.width}px`,
      payload: { width: baseline.width },
      confidence: 0.9,
    });
  }

  if (Math.abs(baseline.height - screenshot.height) > 20) {
    // 高度差异可能是padding问题
    const currentPadding = sectionRoot.style.padding;
    const heightDiff = baseline.height - screenshot.height;

    if (heightDiff > 0) {
      // 需要增加padding
      fixes.push({
        type: "update-padding",
        nodeId: sectionRoot.id,
        description: `增加垂直padding: ${Math.abs(heightDiff / 2).toFixed(0)}px`,
        payload: {
          padding: {
            top: (currentPadding?.top ?? 0) + Math.abs(heightDiff / 2),
            bottom: (currentPadding?.bottom ?? 0) + Math.abs(heightDiff / 2),
            left: currentPadding?.left ?? 0,
            right: currentPadding?.right ?? 0,
          },
        },
        confidence: 0.7,
      });
    } else {
      // 需要减少padding
      fixes.push({
        type: "update-padding",
        nodeId: sectionRoot.id,
        description: `减少垂直padding: ${Math.abs(heightDiff / 2).toFixed(0)}px`,
        payload: {
          padding: {
            top: Math.max(0, (currentPadding?.top ?? 0) - Math.abs(heightDiff / 2)),
            bottom: Math.max(0, (currentPadding?.bottom ?? 0) - Math.abs(heightDiff / 2)),
            left: currentPadding?.left ?? 0,
            right: currentPadding?.right ?? 0,
          },
        },
        confidence: 0.7,
      });
    }
  }

  // 2. 颜色差异
  for (const issue of analysis.colorIssues) {
    if (issue.expected && issue.expected !== "未知" && issue.expected !== "设计稿颜色") {
      fixes.push({
        type: "update-background",
        nodeId: sectionRoot.id,
        description: `调整背景颜色: ${issue.expected}`,
        payload: { background: issue.expected },
        confidence: 0.8,
      });
    }
  }

  // 3. 字体问题
  const textNodes = collectTextNodes(sectionRoot, nodeMap);
  for (const issue of analysis.typographyIssues) {
    // 找到对应的文本节点
    for (const textNode of textNodes) {
      if (issue.type === "font-size") {
        const currentSize = textNode.style.fontSize ?? 16;
        const match = issue.expected.match(/(\d+)-(\d+)px/);
        if (match) {
          const minSize = parseInt(match[1]);
          const maxSize = parseInt(match[2]);
          if (currentSize < minSize || currentSize > maxSize) {
            const targetSize = Math.max(minSize, Math.min(maxSize, currentSize));
            fixes.push({
              type: "update-fontSize",
              nodeId: textNode.id,
              description: `调整字体大小: ${targetSize}px`,
              payload: { fontSize: targetSize },
              confidence: 0.6,
            });
          }
        }
      }
    }
  }

  // 4. 间距问题 - 转换为margin修复
  for (const issue of analysis.spacingIssues) {
    if (issue.type === "gap") {
      const children = sectionRoot.children.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];
      for (const child of children) {
        fixes.push({
          type: "update-margin",
          nodeId: child.id,
          description: `调整子元素margin: ${issue.expected}px`,
          payload: {
            margin: {
              top: 0,
              bottom: issue.expected,
              left: 0,
              right: 0,
            },
          },
          confidence: 0.5,
        });
      }
    }
  }

  // 按置信度排序
  return fixes.sort((a, b) => b.confidence - a.confidence);
}

function collectTextNodes(node: DSLNode, nodeMap: Map<string, DSLNode>): DSLNode[] {
  const textNodes: DSLNode[] = [];

  if (node.type === "text") {
    textNodes.push(node);
  }

  for (const childId of node.children) {
    const child = nodeMap.get(childId);
    if (child) {
      textNodes.push(...collectTextNodes(child, nodeMap));
    }
  }

  return textNodes;
}
