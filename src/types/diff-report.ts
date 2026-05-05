/**
 * 多层差异报告类型
 *
 * 四层检测优先级: DOM 几何 > 区域颜色 > 文字内容 > 截图兜底
 */

export type DiffIssueType = "layout" | "color" | "text" | "screenshot";

export type IssueSeverity = "critical" | "major" | "minor";

// ========== Layout ==========

export type LayoutIssue = {
  type: "layout";
  severity: IssueSeverity;
  selector: string;
  nodeId?: string;
  property: "x" | "y" | "width" | "height" | "gap" | "padding";
  expected: number;
  actual: number;
  diff: number;
  tolerance: number;
  suggestion: string;
};

// ========== Color ==========

export type ColorIssue = {
  type: "color";
  severity: IssueSeverity;
  selector: string;
  nodeId?: string;
  property: "background" | "color" | "border-color";
  expected: string;
  actualAverage: string;
  deltaE: number;
  suggestion: string;
};

// ========== Text ==========

export type TextIssue = {
  type: "text";
  severity: IssueSeverity;
  selector: string;
  nodeId?: string;
  property: "content" | "fontSize" | "fontWeight" | "color" | "fontFamily";
  expected: string | number;
  actual: string | number;
  suggestion: string;
};

// ========== Screenshot (兜底) ==========

export type ScreenshotIssue = {
  type: "screenshot";
  severity: IssueSeverity;
  sectionId: string;
  matchRate: number;
  mismatchedBlocks: number;
  totalBlocks: number;
};

// ========== 聚合 ==========

export type DiffIssue = LayoutIssue | ColorIssue | TextIssue | ScreenshotIssue;

export type SectionDiffReport = {
  sectionId: string;
  sectionName: string;
  passed: boolean;
  visualWarning?: boolean;
  issues: DiffIssue[];
  overallMatchRate: number;
};

export type CodeQualityMetrics = {
  absoluteRatio: number;
  semanticTagRatio: number;
  cssReuseRatio: number;
  inlineStyleRatio: number;
  badInlineRatio: number;
  maxDepth: number;
  avgDepth: number;
  layoutConsistencyScore: number;
  modeDistribution: { semantic: number; grid: number; pixel: number };
  eligibleGridCoverage: number;
  maintainabilityScore: number;
  nodeRecognitionCoverage?: number;       // recognized / total nodes (含 text/image/icon, 容易接近 100%)
  meaningfulComponentCoverage?: number;   // button/card/grid/accordion/link / 总 container 数 (真正有意义)
  animationCoverage?: number;             // animatable / total components
};

export type LayoutHint = {
  sectionId: string;
  inferredMode: "grid" | "flex-row" | "flex-column" | "unknown";
  columnCount?: number;
  gapX?: number;
  gapY?: number;
  confidence: number;
};

export type PageDiffReport = {
  sections: SectionDiffReport[];
  summary: {
    totalSections: number;
    passedSections: number;
    failedSections: number;
    averageMatchRate: number;
    codeQuality?: CodeQualityMetrics;
  };
  layoutHints?: LayoutHint[];
  timestamp: string;
};
