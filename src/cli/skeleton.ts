#!/usr/bin/env node
/**
 * Skeleton Inspector — 输出设计稿的 Section 切割结构
 *
 * 用法: npm run skeleton
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitSections } from "../generators/section-splitter.js";
import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";

const DSL_PATH = process.env.DSL_PATH || join(process.cwd(), "output", "machine-dsl.json");

function loadDSL(): MachineDSL {
  const raw = readFileSync(DSL_PATH, "utf-8");
  return JSON.parse(raw) as MachineDSL;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function drawSkeleton(dsl: MachineDSL): void {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const sections = splitSections(dsl);
  const pageW = dsl.page.width;
  const pageH = dsl.page.height;

  console.log(`\n╔${"═".repeat(62)}╗`);
  console.log(`║${center(`📐 ${dsl.page.name}  —  ${pageW}×${pageH}px`, 62)}║`);
  console.log(`╠${"═".repeat(62)}╣`);

  if (sections.length === 0) {
    console.log(`║${pad("⚠️  未识别到 Section", 62)}║`);
    console.log(`╚${"═".repeat(62)}╝\n`);
    return;
  }

  // 计算绝对坐标（累加祖先偏移）
  function getAbsoluteXY(node: DSLNode): { x: number; y: number } {
    let x = node.layout.x ?? 0;
    let y = node.layout.y ?? 0;
    let curr = node;
    while (curr.parentId) {
      const parent = nodeMap.get(curr.parentId);
      if (!parent) break;
      x += parent.layout.x ?? 0;
      y += parent.layout.y ?? 0;
      curr = parent;
    }
    return { x, y };
  }

  // 收集每个 section 的几何信息
  const sectionGeos = sections.map((sec, idx) => {
    const root = nodeMap.get(sec.nodeId);
    if (!root) return { section: sec, idx, x: 0, y: 0, w: 0, h: 0, missing: true };

    const abs = getAbsoluteXY(root);
    const x = abs.x;
    const y = abs.y;
    const w = typeof root.layout.width === "number" ? root.layout.width : pageW;
    const h = typeof root.layout.height === "number" ? root.layout.height : 100;

    // 检测子节点类型分布
    const typeCount = new Map<string, number>();
    function countTypes(n: DSLNode) {
      typeCount.set(n.type, (typeCount.get(n.type) || 0) + 1);
      for (const cid of n.children) {
        const child = nodeMap.get(cid);
        if (child) countTypes(child);
      }
    }
    countTypes(root);
    const typeLabel = Array.from(typeCount.entries())
      .filter(([t]) => t !== "container")
      .map(([t, c]) => `${t}:${c}`)
      .join(" ") || "container-only";

    return { section: sec, idx, x, y, w, h, typeLabel, missing: false };
  });

  // 按 y 坐标排序（从上到下）
  sectionGeos.sort((a, b) => a.y - b.y);

  const DISPLAY_WIDTH = 60;
  const scale = DISPLAY_WIDTH / pageW;

  for (const geo of sectionGeos) {
    const sec = geo.section;
    const idx = geo.idx;

    if (geo.missing) {
      console.log(`║ ${String(idx + 1).padStart(2)}. ${truncate(sec.name, 25).padEnd(25)} ⚠️ root missing${"".padEnd(22)} ║`);
      continue;
    }

    const barW = Math.max(3, Math.round(geo.w * scale));
    const barX = Math.round(geo.x * scale);
    const bar = " ".repeat(Math.min(barX, DISPLAY_WIDTH - barW)) + "█".repeat(barW);
    const clippedBar = bar.slice(0, DISPLAY_WIDTH).padEnd(DISPLAY_WIDTH);

    const nameLine = `${String(idx + 1).padStart(2)}. ${truncate(sec.name, 20).padEnd(20)}`;
    const geoLine = `${Math.round(geo.x)},${Math.round(geo.y)} ${Math.round(geo.w)}×${Math.round(geo.h)}`;

    console.log(`║ ${nameLine} ${geoLine.padEnd(18)} ${String(sec.nodeIds.length).padStart(3)}n ║`);
    console.log(`║   ┌${clippedBar}┐ ║`);

    // 显示类型分布（如果空间够）
    const typeStr = truncate(geo.typeLabel, DISPLAY_WIDTH - 6);
    if (typeStr) {
      console.log(`║   │ ${typeStr.padEnd(DISPLAY_WIDTH - 4)}│ ║`);
    }
  }

  // 汇总表
  console.log(`╠${"═".repeat(62)}╣`);
  console.log(`║ ${pad(`共 ${sections.length} 个 Section`, 30)} ${pad(`${dsl.nodes.length} 个节点`, 29)}║`);
  console.log(`╚${"═".repeat(62)}╝\n`);

  // 详细列表
  console.log("📋 Section 详情（按从上到下顺序）:");
  console.log("-".repeat(70));
  console.log(` ${"#".padStart(3)} │ ${"名称".padEnd(22)} │ ${"位置".padEnd(14)} │ ${"尺寸".padEnd(12)} │ 节点数`);
  console.log("-".repeat(70));
  for (const geo of sectionGeos) {
    const s = geo.section;
    const pos = geo.missing ? "—" : `${Math.round(geo.x)},${Math.round(geo.y)}`;
    const size = geo.missing ? "—" : `${Math.round(geo.w)}×${Math.round(geo.h)}`;
    console.log(
      ` ${String(geo.idx + 1).padStart(3)} │ ${truncate(s.name, 22).padEnd(22)} │ ${pos.padEnd(14)} │ ${size.padEnd(12)} │ ${s.nodeIds.length}`,
    );
  }
  console.log("-".repeat(70));

  // 警告：检测可能的问题
  const issues: string[] = [];
  for (const geo of sectionGeos) {
    if (geo.missing) continue;
    // 检测偏左/偏右（x 很大或很小但宽度不匹配）
    if (geo.x > pageW * 0.1 && geo.x + geo.w < pageW * 0.9) {
      issues.push(`⚠️  [${geo.section.name}] x=${Math.round(geo.x)} 可能未居中对齐`);
    }
    // 检测宽度异常
    if (geo.w < pageW * 0.3) {
      issues.push(`⚠️  [${geo.section.name}] 宽度 ${Math.round(geo.w)}px 过窄（页面宽 ${pageW}px）`);
    }
  }
  if (issues.length > 0) {
    console.log("\n🚨 布局异常检测:");
    for (const issue of issues) console.log(`   ${issue}`);
  }
  console.log("");
}

function center(str: string, width: number): string {
  const pad = width - str.length;
  const left = Math.floor(pad / 2);
  const right = Math.ceil(pad / 2);
  return " ".repeat(Math.max(0, left)) + str + " ".repeat(Math.max(0, right));
}

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

// Main
const dsl = loadDSL();
drawSkeleton(dsl);
