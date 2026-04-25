import type { DSLAST, ValidationResult, ASTVisitor } from '@shared/types/ast';

/**
 * DSL 解析器接口
 */
export interface IDSLParser {
  /**
   * 解析 DSL 字符串为 AST
   * @param dsl - DSL 字符串（JSON 格式）
   * @returns 抽象语法树
   */
  parse(dsl: string): Promise<DSLAST>;

  /**
   * 验证 DSL 语法正确性
   * @param dsl - DSL 字符串
   * @returns 验证结果
   */
  validate(dsl: string): ValidationResult;

  /**
   * 遍历 AST
   * @param ast - 抽象语法树
   * @param visitor - 访问者对象
   */
  traverse(ast: DSLAST, visitor: ASTVisitor): void;
}
