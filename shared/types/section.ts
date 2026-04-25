/**
 * Section 类型定义
 * 用于表示页面中识别出的 Section
 */

export interface Section {
  id: string;
  name: string;
  type: SectionType;
  nodeIds: string[];
  rootNodeId: string;
  bounds: SectionBounds;
  complexity: ComplexityScore;
  metadata: SectionMetadata;
}

export type SectionType =
  | 'header'
  | 'footer'
  | 'navigation'
  | 'hero'
  | 'content'
  | 'sidebar'
  | 'card'
  | 'list'
  | 'form'
  | 'unknown';

export interface SectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComplexityScore {
  total: number;
  nodeCount: number;
  nestingDepth: number;
  styleDiversity: number;
  interactiveElements: number;
  breakdown: {
    nodeCountScore: number;
    nestingDepthScore: number;
    styleDiversityScore: number;
    interactiveScore: number;
  };
}

export interface SectionMetadata {
  detectedBy: DetectionMethod[];
  confidence: number;
  hasInteractiveElements: boolean;
  dominantColors: string[];
  dominantFonts: string[];
}

export type DetectionMethod = 'hierarchy' | 'spacing' | 'semantic' | 'visual';

export interface SectionManifest {
  version: string;
  generatedAt: Date;
  pageId: string;
  pageName: string;
  totalSections: number;
  sections: Section[];
  statistics: ManifestStatistics;
}

export interface ManifestStatistics {
  averageComplexity: number;
  maxComplexity: number;
  minComplexity: number;
  totalNodes: number;
  sectionTypes: Record<SectionType, number>;
}
