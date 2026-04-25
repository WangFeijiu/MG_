import type { DSLAST, ASTNode } from '@shared/types/ast';
import type {
  Section,
  SectionManifest,
  SectionType,
  ComplexityScore,
  DetectionMethod,
  ManifestStatistics,
} from '@shared/types/section';
import type { ISectionAnalyzer } from '@shared/types/analyzer';

/**
 * Section 分析器实现
 * 智能识别页面中的 Section
 */
export class SectionAnalyzer implements ISectionAnalyzer {
  private readonly SPACING_THRESHOLD = 40;
  private readonly SEMANTIC_KEYWORDS: Record<string, SectionType> = {
    header: 'header',
    footer: 'footer',
    nav: 'navigation',
    navigation: 'navigation',
    hero: 'hero',
    banner: 'hero',
    sidebar: 'sidebar',
    aside: 'sidebar',
    card: 'card',
    list: 'list',
    form: 'form',
  };

  /**
   * 分析 AST 并识别 Sections
   */
  analyze(ast: DSLAST): Section[] {
    const sections: Section[] = [];
    const rootNode = ast.nodes.get(ast.root);

    if (!rootNode) {
      return sections;
    }

    // 遍历顶层子节点，每个可能是一个 Section
    for (const childId of rootNode.children) {
      const childNode = ast.nodes.get(childId);
      if (!childNode) continue;

      const section = this.analyzeNode(childNode, ast);
      if (section) {
        sections.push(section);
      }
    }

    return sections;
  }

  /**
   * 分析单个节点是否为 Section
   */
  private analyzeNode(node: ASTNode, ast: DSLAST): Section | null {
    // 收集节点及其所有子节点
    const nodeIds = this.collectNodeIds(node, ast);

    // 检测 Section 类型
    const detectionMethods: DetectionMethod[] = [];
    let sectionType: SectionType = 'unknown';
    let confidence = 0;

    // 1. 基于层级识别
    if (this.isTopLevelContainer(node, ast)) {
      detectionMethods.push('hierarchy');
      confidence += 0.3;
    }

    // 2. 基于语义识别
    const semanticType = this.detectSemanticType(node);
    if (semanticType !== 'unknown') {
      sectionType = semanticType;
      detectionMethods.push('semantic');
      confidence += 0.4;
    }

    // 3. 基于间距识别
    if (this.hasSignificantSpacing(node, ast)) {
      detectionMethods.push('spacing');
      confidence += 0.2;
    }

    // 4. 基于视觉特征识别
    if (this.hasDistinctVisualStyle(node)) {
      detectionMethods.push('visual');
      confidence += 0.1;
    }

    // 计算边界
    const bounds = this.calculateBounds(node);

    // 计算复杂度
    const complexity = this.calculateComplexityScore(nodeIds, ast);

    // 收集元数据
    const metadata = {
      detectedBy: detectionMethods,
      confidence: Math.min(confidence, 1.0),
      hasInteractiveElements: this.hasInteractiveElements(nodeIds, ast),
      dominantColors: this.extractDominantColors(nodeIds, ast),
      dominantFonts: this.extractDominantFonts(nodeIds, ast),
    };

    return {
      id: `section-${node.id}`,
      name: node.name || `Section ${node.id}`,
      type: sectionType,
      nodeIds,
      rootNodeId: node.id,
      bounds,
      complexity,
      metadata,
    };
  }

  /**
   * 收集节点及其所有子节点的 ID
   */
  private collectNodeIds(node: ASTNode, ast: DSLAST): string[] {
    const ids: string[] = [node.id];

    for (const childId of node.children) {
      const childNode = ast.nodes.get(childId);
      if (childNode) {
        ids.push(...this.collectNodeIds(childNode, ast));
      }
    }

    return ids;
  }

  /**
   * 判断是否为顶层容器
   */
  private isTopLevelContainer(node: ASTNode, ast: DSLAST): boolean {
    if (node.type !== 'container') return false;

    const parent = node.parentId ? ast.nodes.get(node.parentId) : null;
    if (!parent) return true;

    // 父节点是根节点
    return parent.id === ast.root;
  }

  /**
   * 基于语义检测 Section 类型
   */
  private detectSemanticType(node: ASTNode): SectionType {
    const name = (node.name || '').toLowerCase();

    for (const [keyword, type] of Object.entries(this.SEMANTIC_KEYWORDS)) {
      if (name.includes(keyword)) {
        return type;
      }
    }

    return 'unknown';
  }

  /**
   * 检查是否有显著间距
   */
  private hasSignificantSpacing(node: ASTNode, ast: DSLAST): boolean {
    const parent = node.parentId ? ast.nodes.get(node.parentId) : null;
    if (!parent) return false;

    // 检查与兄弟节点的间距
    const siblings = parent.children
      .map((id) => ast.nodes.get(id))
      .filter((n): n is ASTNode => n !== null && n.id !== node.id);

    for (const sibling of siblings) {
      const spacing = this.calculateSpacing(node, sibling);
      if (spacing >= this.SPACING_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  /**
   * 计算两个节点之间的间距
   */
  private calculateSpacing(node1: ASTNode, node2: ASTNode): number {
    const y1 = node1.layout.y || 0;
    const h1 = typeof node1.layout.height === 'number' ? node1.layout.height : 0;
    const y2 = node2.layout.y || 0;

    return Math.abs(y2 - (y1 + h1));
  }

  /**
   * 检查是否有独特的视觉样式
   */
  private hasDistinctVisualStyle(node: ASTNode): boolean {
    const { style } = node;

    // 有背景色或背景图
    if (style.background || style.backgroundImage) {
      return true;
    }

    // 有边框
    if (style.border) {
      return true;
    }

    // 有阴影
    if (style.boxShadow) {
      return true;
    }

    return false;
  }

  /**
   * 计算节点边界
   */
  private calculateBounds(node: ASTNode) {
    return {
      x: node.layout.x || 0,
      y: node.layout.y || 0,
      width: typeof node.layout.width === 'number' ? node.layout.width : 0,
      height: typeof node.layout.height === 'number' ? node.layout.height : 0,
    };
  }

  /**
   * 计算复杂度评分
   */
  calculateComplexity(section: Section, ast: DSLAST): number {
    return this.calculateComplexityScore(section.nodeIds, ast).total;
  }

  /**
   * 计算复杂度评分（详细）
   */
  private calculateComplexityScore(nodeIds: string[], ast: DSLAST): ComplexityScore {
    // 1. 节点数评分 (30%)
    const nodeCount = nodeIds.length;
    const nodeCountScore = Math.min(nodeCount / 50, 1.0) * 30;

    // 2. 嵌套深度评分 (20%)
    const nestingDepth = this.calculateMaxDepth(nodeIds, ast);
    const nestingDepthScore = Math.min(nestingDepth / 10, 1.0) * 20;

    // 3. 样式多样性评分 (20%)
    const styleDiversity = this.calculateStyleDiversity(nodeIds, ast);
    const styleDiversityScore = Math.min(styleDiversity / 20, 1.0) * 20;

    // 4. 交互元素评分 (30%)
    const interactiveCount = this.countInteractiveElements(nodeIds, ast);
    const interactiveScore = Math.min(interactiveCount / 10, 1.0) * 30;

    const total = nodeCountScore + nestingDepthScore + styleDiversityScore + interactiveScore;

    return {
      total: Math.round(total * 10) / 10,
      nodeCount,
      nestingDepth,
      styleDiversity,
      interactiveElements: interactiveCount,
      breakdown: {
        nodeCountScore: Math.round(nodeCountScore * 10) / 10,
        nestingDepthScore: Math.round(nestingDepthScore * 10) / 10,
        styleDiversityScore: Math.round(styleDiversityScore * 10) / 10,
        interactiveScore: Math.round(interactiveScore * 10) / 10,
      },
    };
  }

  /**
   * 计算最大嵌套深度
   */
  private calculateMaxDepth(nodeIds: string[], ast: DSLAST): number {
    let maxDepth = 0;

    for (const nodeId of nodeIds) {
      const node = ast.nodes.get(nodeId);
      if (!node) continue;

      const depth = this.getNodeDepth(node, ast);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  /**
   * 获取节点深度
   */
  private getNodeDepth(node: ASTNode, ast: DSLAST): number {
    let depth = 0;
    let current = node;

    while (current.parentId) {
      depth++;
      const parent = ast.nodes.get(current.parentId);
      if (!parent) break;
      current = parent;
    }

    return depth;
  }

  /**
   * 计算样式多样性
   */
  private calculateStyleDiversity(nodeIds: string[], ast: DSLAST): number {
    const uniqueColors = new Set<string>();
    const uniqueFonts = new Set<string>();
    const uniqueFontSizes = new Set<number>();

    for (const nodeId of nodeIds) {
      const node = ast.nodes.get(nodeId);
      if (!node) continue;

      if (node.style.color) uniqueColors.add(node.style.color);
      if (node.style.background) uniqueColors.add(node.style.background);
      if (node.style.fontFamily) uniqueFonts.add(node.style.fontFamily);
      if (node.style.fontSize) uniqueFontSizes.add(node.style.fontSize);
    }

    return uniqueColors.size + uniqueFonts.size + uniqueFontSizes.size;
  }

  /**
   * 统计交互元素数量
   */
  private countInteractiveElements(nodeIds: string[], ast: DSLAST): number {
    let count = 0;

    for (const nodeId of nodeIds) {
      const node = ast.nodes.get(nodeId);
      if (!node) continue;

      if (node.type === 'button' || node.type === 'icon') {
        count++;
      }
    }

    return count;
  }

  /**
   * 检查是否有交互元素
   */
  private hasInteractiveElements(nodeIds: string[], ast: DSLAST): boolean {
    return this.countInteractiveElements(nodeIds, ast) > 0;
  }

  /**
   * 提取主要颜色
   */
  private extractDominantColors(nodeIds: string[], ast: DSLAST): string[] {
    const colorCounts = new Map<string, number>();

    for (const nodeId of nodeIds) {
      const node = ast.nodes.get(nodeId);
      if (!node) continue;

      if (node.style.color) {
        colorCounts.set(node.style.color, (colorCounts.get(node.style.color) || 0) + 1);
      }
      if (node.style.background) {
        colorCounts.set(node.style.background, (colorCounts.get(node.style.background) || 0) + 1);
      }
    }

    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([color]) => color);
  }

  /**
   * 提取主要字体
   */
  private extractDominantFonts(nodeIds: string[], ast: DSLAST): string[] {
    const fontCounts = new Map<string, number>();

    for (const nodeId of nodeIds) {
      const node = ast.nodes.get(nodeId);
      if (!node || !node.style.fontFamily) continue;

      fontCounts.set(node.style.fontFamily, (fontCounts.get(node.style.fontFamily) || 0) + 1);
    }

    return Array.from(fontCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([font]) => font);
  }

  /**
   * 生成 Section Manifest
   */
  generateManifest(ast: DSLAST, sections: Section[]): SectionManifest {
    const statistics = this.calculateStatistics(sections);

    return {
      version: '1.0.0',
      generatedAt: new Date(),
      pageId: ast.page.id,
      pageName: ast.page.name,
      totalSections: sections.length,
      sections,
      statistics,
    };
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(sections: Section[]): ManifestStatistics {
    const complexities = sections.map((s) => s.complexity.total);
    const sectionTypes: Record<SectionType, number> = {
      header: 0,
      footer: 0,
      navigation: 0,
      hero: 0,
      content: 0,
      sidebar: 0,
      card: 0,
      list: 0,
      form: 0,
      unknown: 0,
    };

    let totalNodes = 0;

    for (const section of sections) {
      sectionTypes[section.type]++;
      totalNodes += section.nodeIds.length;
    }

    return {
      averageComplexity:
        complexities.length > 0
          ? Math.round((complexities.reduce((a, b) => a + b, 0) / complexities.length) * 10) / 10
          : 0,
      maxComplexity: complexities.length > 0 ? Math.max(...complexities) : 0,
      minComplexity: complexities.length > 0 ? Math.min(...complexities) : 0,
      totalNodes,
      sectionTypes,
    };
  }
}
