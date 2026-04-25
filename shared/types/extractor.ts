import type { DSLAST } from '@shared/types/ast';
import type { DesignTokens, TokenIndex } from '@shared/types/tokens';

/**
 * Token 提取器接口
 */
export interface ITokenExtractor {
  /**
   * 从 AST 中提取设计令牌
   * @param ast - 抽象语法树
   * @returns 设计令牌集合
   */
  extract(ast: DSLAST): DesignTokens;

  /**
   * 生成 CSS 变量定义
   * @param tokens - 设计令牌
   * @returns CSS 变量字符串
   */
  generateCSSVariables(tokens: DesignTokens): string;

  /**
   * 聚类相似值
   * @param values - 值数组
   * @param threshold - 相似度阈值
   * @returns 聚类结果
   */
  clusterSimilarValues(values: string[], threshold?: number): Map<string, string[]>;

  /**
   * 构建 Token 索引
   * @param tokens - 设计令牌
   * @returns Token 索引
   */
  buildIndex(tokens: DesignTokens): TokenIndex;
}
