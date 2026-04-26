#!/usr/bin/env node
/**
 * Clean Output — 清除 output/ 目录下除 PNG 外的所有产物
 *
 * 保留:
 *   - *.png 文件（设计稿截图、对比图等）
 *   - 子目录中的 *.png 文件
 *
 * 删除:
 *   - *.html, *.css, *.json, *.js, *.tsx 等生成产物
 *   - 空目录
 *
 * 用法: npm run clean
 */

import { readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const OUTPUT_DIR = process.env.OUTPUT_DIR || join(process.cwd(), "output");

const KEPT_PATTERNS = [".png"];
const REMOVED_PATTERNS = [".html", ".css", ".json", ".js", ".jsx", ".ts", ".tsx", ".md", ".txt", ".svg", ".jpg", ".jpeg", ".webp", ".gif"];

function isKept(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return KEPT_PATTERNS.includes(ext);
}

function cleanDir(dir: string, depth = 0): { deleted: number; kept: number; emptyDirs: number } {
  if (!existsSync(dir)) {
    console.log(`⚠️  目录不存在: ${dir}`);
    return { deleted: 0, kept: 0, emptyDirs: 0 };
  }

  let deleted = 0;
  let kept = 0;
  let emptyDirs = 0;

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const sub = cleanDir(fullPath, depth + 1);
      deleted += sub.deleted;
      kept += sub.kept;
      emptyDirs += sub.emptyDirs;

      // 尝试删除空目录（但保留 output 根目录）
      if (depth > 0) {
        try {
          rmdirSync(fullPath);
          emptyDirs++;
        } catch {
          // 目录不为空，忽略
        }
      }
    } else {
      if (isKept(fullPath)) {
        kept++;
      } else {
        try {
          unlinkSync(fullPath);
          deleted++;
          console.log(`  🗑️  ${fullPath.replace(process.cwd() + "/", "")}`);
        } catch (err: any) {
          console.log(`  ⚠️  删除失败: ${fullPath} — ${err.message}`);
        }
      }
    }
  }

  return { deleted, kept, emptyDirs };
}

console.log(`\n🧹 清理 output/ 目录（保留 *.png）...\n`);
const result = cleanDir(OUTPUT_DIR);

console.log(`\n✅ 清理完成`);
console.log(`   删除文件: ${result.deleted}`);
console.log(`   保留 PNG: ${result.kept}`);
console.log(`   删除空目录: ${result.emptyDirs}`);
console.log("");
