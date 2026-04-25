import type { DSLAST, ASTNode } from '@shared/types/ast';
import type {
  DesignTokens,
  ColorTokens,
  ColorToken,
  TypographyTokens,
  TypographyToken,
  SpacingTokens,
  SpacingToken,
  BorderRadiusTokens,
  BorderRadiusToken,
  ShadowTokens,
  ShadowToken,
  TokenIndex,
  NodeTokens,
  TokenType,
} from '@shared/types/tokens';
import type { ITokenExtractor } from '@shared/types/extractor';

/**
 * Design Tokens 提取器实现
 */
export class TokenExtractor implements ITokenExtractor {
  /**
   * 从 AST 中提取设计令牌
   */
  extract(ast: DSLAST): DesignTokens {
    const colors: ColorTokens = {
      primary: new Map(),
      text: new Map(),
      background: new Map(),
      border: new Map(),
    };

    const typography: TypographyTokens = {
      fontSizes: new Map(),
      fontWeights: new Map(),
      fontFamilies: new Map(),
      lineHeights: new Map(),
    };

    const spacing: SpacingTokens = {
      padding: new Map(),
      margin: new Map(),
      gap: new Map(),
    };

    const borderRadius: BorderRadiusTokens = {
      values: new Map(),
    };

    const shadows: ShadowTokens = {
      values: new Map(),
    };

    // 遍历所有节点提取样式值
    for (const [nodeId, node] of ast.nodes) {
      this.extractNodeTokens(node, colors, typography, spacing, borderRadius, shadows);
    }

    // 聚类相似颜色
    this.clusterColors(colors);

    return {
      colors,
      typography,
      spacing,
      borderRadius,
      shadows,
    };
  }

  /**
   * 从单个节点提取 tokens
   */
  private extractNodeTokens(
    node: ASTNode,
    colors: ColorTokens,
    typography: TypographyTokens,
    spacing: SpacingTokens,
    borderRadius: BorderRadiusTokens,
    shadows: ShadowTokens
  ): void {
    const { style, layout } = node;

    // 提取颜色
    if (style.color) {
      this.addColorToken(colors.text, style.color, node.id);
    }
    if (style.background) {
      this.addColorToken(colors.background, style.background, node.id);
    }
    if (style.border) {
      const borderColor = this.extractBorderColor(style.border);
      if (borderColor) {
        this.addColorToken(colors.border, borderColor, node.id);
      }
    }

    // 提取字体
    if (style.fontSize) {
      this.addTypographyToken(typography.fontSizes, style.fontSize, node.id);
    }
    if (style.fontWeight) {
      this.addTypographyToken(typography.fontWeights, style.fontWeight, node.id);
    }
    if (style.fontFamily) {
      this.addTypographyToken(typography.fontFamilies, style.fontFamily, node.id);
    }
    if (style.lineHeight) {
      this.addTypographyToken(typography.lineHeights, style.lineHeight, node.id);
    }

    // 提取间距
    if (style.padding) {
      this.addSpacingTokens(spacing.padding, style.padding, node.id);
    }
    if (style.margin) {
      this.addSpacingTokens(spacing.margin, style.margin, node.id);
    }
    if (layout.gap) {
      this.addSpacingToken(spacing.gap, layout.gap, node.id);
    }

    // 提取圆角
    if (style.borderRadius) {
      if (typeof style.borderRadius === 'object') {
        this.addBorderRadiusToken(borderRadius.values, style.borderRadius.topLeft, node.id);
        this.addBorderRadiusToken(borderRadius.values, style.borderRadius.topRight, node.id);
        this.addBorderRadiusToken(borderRadius.values, style.borderRadius.bottomRight, node.id);
        this.addBorderRadiusToken(borderRadius.values, style.borderRadius.bottomLeft, node.id);
      }
    }

    // 提取阴影
    if (style.boxShadow) {
      this.addShadowToken(shadows.values, style.boxShadow, node.id);
    }
  }

  /**
   * 添加颜色 token
   */
  private addColorToken(map: Map<string, ColorToken>, value: string, nodeId: string): void {
    const normalized = this.normalizeColor(value);
    const existing = map.get(normalized);

    if (existing) {
      existing.usage++;
      existing.nodes.push(nodeId);
    } else {
      map.set(normalized, {
        value: normalized,
        name: this.generateColorName(normalized, map.size),
        usage: 1,
        nodes: [nodeId],
      });
    }
  }

  /**
   * 添加字体 token
   */
  private addTypographyToken(
    map: Map<string, TypographyToken>,
    value: string | number,
    nodeId: string
  ): void {
    const key = String(value);
    const existing = map.get(key);

    if (existing) {
      existing.usage++;
      existing.nodes.push(nodeId);
    } else {
      map.set(key, {
        value,
        name: this.generateTypographyName(value, map.size),
        usage: 1,
        nodes: [nodeId],
      });
    }
  }

  /**
   * 添加间距 tokens（处理 Spacing 对象）
   */
  private addSpacingTokens(
    map: Map<string, SpacingToken>,
    spacing: { top: number; right: number; bottom: number; left: number },
    nodeId: string
  ): void {
    this.addSpacingToken(map, spacing.top, nodeId);
    this.addSpacingToken(map, spacing.right, nodeId);
    this.addSpacingToken(map, spacing.bottom, nodeId);
    this.addSpacingToken(map, spacing.left, nodeId);
  }

  /**
   * 添加间距 token
   */
  private addSpacingToken(map: Map<string, SpacingToken>, value: number, nodeId: string): void {
    const key = String(value);
    const existing = map.get(key);

    if (existing) {
      existing.usage++;
      existing.nodes.push(nodeId);
    } else {
      map.set(key, {
        value,
        name: this.generateSpacingName(value, map.size),
        usage: 1,
        nodes: [nodeId],
      });
    }
  }

  /**
   * 添加圆角 token
   */
  private addBorderRadiusToken(
    map: Map<string, BorderRadiusToken>,
    value: number,
    nodeId: string
  ): void {
    const key = String(value);
    const existing = map.get(key);

    if (existing) {
      existing.usage++;
      existing.nodes.push(nodeId);
    } else {
      map.set(key, {
        value,
        name: this.generateBorderRadiusName(value, map.size),
        usage: 1,
        nodes: [nodeId],
      });
    }
  }

  /**
   * 添加阴影 token
   */
  private addShadowToken(map: Map<string, ShadowToken>, value: string, nodeId: string): void {
    const existing = map.get(value);

    if (existing) {
      existing.usage++;
      existing.nodes.push(nodeId);
    } else {
      map.set(value, {
        value,
        name: this.generateShadowName(map.size),
        usage: 1,
        nodes: [nodeId],
      });
    }
  }

  /**
   * 规范化颜色值
   */
  private normalizeColor(color: string): string {
    // 转换为小写
    color = color.toLowerCase().trim();

    // 处理 rgba
    if (color.startsWith('rgba')) {
      return color;
    }

    // 处理 rgb
    if (color.startsWith('rgb')) {
      return color;
    }

    // 处理 hex
    if (color.startsWith('#')) {
      // 转换 3 位 hex 为 6 位
      if (color.length === 4) {
        return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      }
      return color;
    }

    return color;
  }

  /**
   * 从 border 字符串中提取颜色
   */
  private extractBorderColor(border: string): string | null {
    // 简化版：假设 border 格式为 "1px solid #000"
    const parts = border.split(' ');
    for (const part of parts) {
      if (part.startsWith('#') || part.startsWith('rgb')) {
        return part;
      }
    }
    return null;
  }

  /**
   * 聚类相似颜色
   */
  clusterSimilarValues(values: string[], threshold: number = 10): Map<string, string[]> {
    const clusters = new Map<string, string[]>();

    for (const value of values) {
      let foundCluster = false;

      for (const [representative, members] of clusters) {
        if (this.areColorsSimilar(value, representative, threshold)) {
          members.push(value);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        clusters.set(value, [value]);
      }
    }

    return clusters;
  }

  /**
   * 聚类颜色 tokens
   */
  private clusterColors(colors: ColorTokens): void {
    // 对每个颜色类别进行聚类
    this.clusterColorMap(colors.primary);
    this.clusterColorMap(colors.text);
    this.clusterColorMap(colors.background);
    this.clusterColorMap(colors.border);
  }

  /**
   * 聚类单个颜色 Map
   */
  private clusterColorMap(colorMap: Map<string, ColorToken>): void {
    const colors = Array.from(colorMap.keys());
    const clusters = this.clusterSimilarValues(colors, 10);

    // 合并聚类中的颜色
    for (const [representative, members] of clusters) {
      if (members.length > 1) {
        const repToken = colorMap.get(representative)!;

        for (const member of members) {
          if (member !== representative) {
            const memberToken = colorMap.get(member);
            if (memberToken) {
              repToken.usage += memberToken.usage;
              repToken.nodes.push(...memberToken.nodes);
              colorMap.delete(member);
            }
          }
        }
      }
    }
  }

  /**
   * 判断两个颜色是否相似
   */
  private areColorsSimilar(color1: string, color2: string, threshold: number): boolean {
    const rgb1 = this.parseColor(color1);
    const rgb2 = this.parseColor(color2);

    if (!rgb1 || !rgb2) return false;

    // 计算欧几里得距离
    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2)
    );

    return distance <= threshold;
  }

  /**
   * 解析颜色为 RGB
   */
  private parseColor(color: string): { r: number; g: number; b: number } | null {
    // 处理 hex
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      if (hex.length === 6) {
        return {
          r: parseInt(hex.substring(0, 2), 16),
          g: parseInt(hex.substring(2, 4), 16),
          b: parseInt(hex.substring(4, 6), 16),
        };
      }
    }

    // 处理 rgb/rgba
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      };
    }

    return null;
  }

  /**
   * 生成 CSS 变量定义
   */
  generateCSSVariables(tokens: DesignTokens): string {
    const lines: string[] = [':root {'];

    // 颜色变量
    for (const [_, token] of tokens.colors.primary) {
      lines.push(`  --color-primary-${token.name}: ${token.value};`);
    }
    for (const [_, token] of tokens.colors.text) {
      lines.push(`  --color-text-${token.name}: ${token.value};`);
    }
    for (const [_, token] of tokens.colors.background) {
      lines.push(`  --color-bg-${token.name}: ${token.value};`);
    }
    for (const [_, token] of tokens.colors.border) {
      lines.push(`  --color-border-${token.name}: ${token.value};`);
    }

    // 字体变量
    for (const [_, token] of tokens.typography.fontSizes) {
      lines.push(`  --font-size-${token.name}: ${token.value}px;`);
    }
    for (const [_, token] of tokens.typography.fontWeights) {
      lines.push(`  --font-weight-${token.name}: ${token.value};`);
    }
    for (const [_, token] of tokens.typography.fontFamilies) {
      lines.push(`  --font-family-${token.name}: ${token.value};`);
    }

    // 间距变量
    for (const [_, token] of tokens.spacing.padding) {
      lines.push(`  --spacing-${token.name}: ${token.value}px;`);
    }

    // 圆角变量
    for (const [_, token] of tokens.borderRadius.values) {
      lines.push(`  --radius-${token.name}: ${token.value}px;`);
    }

    // 阴影变量
    for (const [_, token] of tokens.shadows.values) {
      lines.push(`  --shadow-${token.name}: ${token.value};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 构建 Token 索引
   */
  buildIndex(tokens: DesignTokens): TokenIndex {
    const byNode = new Map<string, NodeTokens>();
    const byType = new Map<TokenType, Set<string>>();

    // 初始化类型索引
    byType.set('color', new Set());
    byType.set('typography', new Set());
    byType.set('spacing', new Set());
    byType.set('borderRadius', new Set());
    byType.set('shadow', new Set());

    // 索引颜色
    this.indexTokens(tokens.colors.primary, byNode, byType.get('color')!, 'colors');
    this.indexTokens(tokens.colors.text, byNode, byType.get('color')!, 'colors');
    this.indexTokens(tokens.colors.background, byNode, byType.get('color')!, 'colors');
    this.indexTokens(tokens.colors.border, byNode, byType.get('color')!, 'colors');

    // 索引字体
    this.indexTokens(tokens.typography.fontSizes, byNode, byType.get('typography')!, 'typography');
    this.indexTokens(
      tokens.typography.fontWeights,
      byNode,
      byType.get('typography')!,
      'typography'
    );
    this.indexTokens(
      tokens.typography.fontFamilies,
      byNode,
      byType.get('typography')!,
      'typography'
    );

    // 索引间距
    this.indexTokens(tokens.spacing.padding, byNode, byType.get('spacing')!, 'spacing');
    this.indexTokens(tokens.spacing.margin, byNode, byType.get('spacing')!, 'spacing');
    this.indexTokens(tokens.spacing.gap, byNode, byType.get('spacing')!, 'spacing');

    // 索引圆角
    this.indexTokens(
      tokens.borderRadius.values,
      byNode,
      byType.get('borderRadius')!,
      'borderRadius'
    );

    // 索引阴影
    this.indexTokens(tokens.shadows.values, byNode, byType.get('shadow')!, 'shadows');

    return { byNode, byType };
  }

  /**
   * 索引 tokens
   */
  private indexTokens(
    tokenMap: Map<string, any>,
    byNode: Map<string, NodeTokens>,
    typeSet: Set<string>,
    field: keyof NodeTokens
  ): void {
    for (const [key, token] of tokenMap) {
      typeSet.add(key);

      for (const nodeId of token.nodes) {
        let nodeTokens = byNode.get(nodeId);
        if (!nodeTokens) {
          nodeTokens = {
            nodeId,
            colors: [],
            typography: [],
            spacing: [],
            borderRadius: [],
            shadows: [],
          };
          byNode.set(nodeId, nodeTokens);
        }
        nodeTokens[field].push(key);
      }
    }
  }

  // Token 命名辅助方法
  private generateColorName(color: string, index: number): string {
    return `${index + 1}`;
  }

  private generateTypographyName(value: string | number, index: number): string {
    return `${index + 1}`;
  }

  private generateSpacingName(value: number, index: number): string {
    // 使用常见的间距命名
    const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
    return names[index] || `${index + 1}`;
  }

  private generateBorderRadiusName(value: number, index: number): string {
    const names = ['none', 'sm', 'md', 'lg', 'xl', 'full'];
    return names[index] || `${index + 1}`;
  }

  private generateShadowName(index: number): string {
    const names = ['sm', 'md', 'lg', 'xl'];
    return names[index] || `${index + 1}`;
  }
}
