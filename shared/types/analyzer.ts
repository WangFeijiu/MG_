import type { DSLAST } from '@shared/types/ast';
import type { Section, SectionManifest } from '@shared/types/section';

/**
 * Section 分析器接口
 */
export interface ISectionAnalyzer {
  /**
   * 分析 AST 并识别 Sections
   * @param ast - 抽象语法树
   * @returns Section 数组
   */
  analyze(ast: DSLAST): Section[];

  /**
   * 生成 Section Manifest
   * @param ast - 抽象语法树
   * @param sections - Section 数组
   * @returns Section Manifest
   */
  generateManifest(ast: DSLAST, sections: Section[]): SectionManifest;

  /**
   * 计算 Section 复杂度
   * @param section - Section 对象
   * @param ast - 抽象语法树
   * @returns 复杂度评分
   */
  calculateComplexity(section: Section, ast: DSLAST): number;
}
