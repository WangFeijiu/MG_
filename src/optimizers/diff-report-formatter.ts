/**
 * Diff Report Formatter — JSON + HTML 报告输出
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PageDiffReport } from "../types/diff-report.js";

export function formatDiffReportJSON(report: PageDiffReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatDiffReportHTML(report: PageDiffReport): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>差异报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; padding: 40px 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; padding: 32px; border-radius: 12px; margin-bottom: 24px; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .time { color: #666; font-size: 14px; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .stat { background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: 600; }
    .stat-label { color: #666; font-size: 13px; margin-top: 4px; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .section { background: white; padding: 24px; border-radius: 12px; margin-bottom: 12px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; }
    .section-name { font-size: 18px; font-weight: 600; }
    .badge { padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; }
    .badge-pass { background: #dcfce7; color: #16a34a; }
    .badge-fail { background: #fee2e2; color: #dc2626; }
    .match-bar { height: 8px; border-radius: 4px; background: #e5e7eb; margin-top: 16px; }
    .match-fill { height: 100%; border-radius: 4px; }
    .issues { margin-top: 12px; }
    .issue { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
    .issue-type { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .issue-layout { background: #dbeafe; color: #1d4ed8; }
    .issue-color { background: #fce7f3; color: #be185d; }
    .issue-text { background: #fef3c7; color: #92400e; }
    .issue-screenshot { background: #e0e7ff; color: #4338ca; }
    .severity-critical { color: #dc2626; font-weight: 600; }
    .severity-major { color: #f59e0b; }
    .severity-minor { color: #9ca3af; }
    .issue-suggestion { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>多层差异报告</h1>
      <p class="time">${new Date(report.timestamp).toLocaleString("zh-CN")}</p>
      <div class="stats">
        <div class="stat"><div class="stat-value">${report.summary.totalSections}</div><div class="stat-label">总 Section</div></div>
        <div class="stat"><div class="stat-value passed">${report.summary.passedSections}</div><div class="stat-label">通过</div></div>
        <div class="stat"><div class="stat-value failed">${report.summary.failedSections}</div><div class="stat-label">失败</div></div>
        <div class="stat"><div class="stat-value">${(report.summary.averageMatchRate * 100).toFixed(1)}%</div><div class="stat-label">平均匹配率</div></div>
      </div>
${report.summary.codeQuality ? renderCodeQualityHTML(report.summary.codeQuality) : ""}
    </div>
    ${report.sections.map((s, i) => `
    <div class="section">
      <div class="section-header">
        <div class="section-name">${i + 1}. ${s.sectionName}</div>
        <div class="badge ${s.passed ? "badge-pass" : "badge-fail"}">
          ${s.passed ? "✓ 通过" : "✗ 失败"} — ${(s.overallMatchRate * 100).toFixed(1)}%${s.visualWarning ? " ⚠ visual" : ""}
        </div>
      </div>
      <div class="match-bar">
        <div class="match-fill" style="width:${(s.overallMatchRate * 100).toFixed(0)}%;background:${s.passed ? "#22c55e" : "#ef4444"};"></div>
      </div>
      ${s.issues.length > 0 ? `<div class="issues">
        ${s.issues.map(issue => `
        <div class="issue">
          <span class="issue-type issue-${issue.type}">${issue.type}</span>
          <span class="severity-${issue.severity}">${issue.severity}</span>
          <span>${"selector" in issue ? issue.selector : ""}</span>
          <span class="issue-suggestion">${"suggestion" in issue ? issue.suggestion : ""}</span>
        </div>`).join("")}
      </div>` : ""}
    </div>`).join("")}
  </div>
</body>
</html>`;
}

export function writeDiffReport(report: PageDiffReport, outputDir: string): void {
  writeFileSync(join(outputDir, "diff-report.json"), formatDiffReportJSON(report));
  writeFileSync(join(outputDir, "diff-report.html"), formatDiffReportHTML(report));
  console.log(`\n📊 报告: ${join(outputDir, "diff-report.html")}\n`);
}

function renderCodeQualityHTML(cq: NonNullable<PageDiffReport["summary"]["codeQuality"]>): string {
  const score = (cq.maintainabilityScore * 100).toFixed(0);
  const scoreColor = cq.maintainabilityScore >= 0.7 ? "#22c55e" : cq.maintainabilityScore >= 0.4 ? "#f59e0b" : "#ef4444";
  const md = cq.modeDistribution;
  const layoutPct = (cq.layoutConsistencyScore * 100).toFixed(0);
  const egc = (cq.eligibleGridCoverage * 100).toFixed(0);
  return `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">
      <h3 style="font-size:16px;margin-bottom:12px">Code Quality</h3>
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="stat-value" style="color:${scoreColor}">${score}</div><div class="stat-label">Maintainability</div></div>
        <div class="stat"><div class="stat-value">${(cq.semanticTagRatio * 100).toFixed(0)}%</div><div class="stat-label">Semantic Tags</div></div>
        <div class="stat"><div class="stat-value">${(cq.cssReuseRatio * 100).toFixed(0)}%</div><div class="stat-label">CSS Reuse</div></div>
        <div class="stat"><div class="stat-value">${(cq.inlineStyleRatio * 100).toFixed(0)}%</div><div class="stat-label">Inline Styles</div></div>
        <div class="stat"><div class="stat-value">${(cq.badInlineRatio * 100).toFixed(0)}%</div><div class="stat-label">Bad Inline</div></div>
        <div class="stat"><div class="stat-value">${layoutPct}%</div><div class="stat-label">Layout Consistency</div></div>
        <div class="stat"><div class="stat-value">${cq.maxDepth}/${cq.avgDepth.toFixed(1)}</div><div class="stat-label">Depth max/avg</div></div>
        <div class="stat"><div class="stat-value">${egc}%</div><div class="stat-label">Grid Coverage</div></div>
        <div class="stat"><div class="stat-value">${(cq.absoluteRatio * 100).toFixed(0)}%</div><div class="stat-label">Absolute</div></div>
        ${cq.nodeRecognitionCoverage != null ? `<div class="stat"><div class="stat-value">${(cq.nodeRecognitionCoverage * 100).toFixed(0)}%</div><div class="stat-label">Node Recognition</div></div>` : ""}
        ${cq.meaningfulComponentCoverage != null ? `<div class="stat"><div class="stat-value">${(cq.meaningfulComponentCoverage * 100).toFixed(0)}%</div><div class="stat-label">Meaningful Component</div></div>` : ""}
        ${cq.animationCoverage != null ? `<div class="stat"><div class="stat-value">${(cq.animationCoverage * 100).toFixed(0)}%</div><div class="stat-label">Animation</div></div>` : ""}
      </div>
      <div style="margin-top:8px;font-size:13px;color:#666">Mode: ${md.semantic} semantic / ${md.grid} grid / ${md.pixel} pixel</div>
    </div>`;
}
