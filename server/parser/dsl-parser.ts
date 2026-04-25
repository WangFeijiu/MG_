import type {
  DSLAST,
  ASTNode,
  ValidationResult,
  ValidationError,
  ASTVisitor,
  Position,
} from '@shared/types/ast';
import type { IDSLParser } from '@shared/types/parser';

/**
 * MasterGo DSL 输入格式
 */
interface MachineDSL {
  page: {
    id: string;
    name: string;
    width: number;
    height: number;
  };
  nodes: any[];
}

/**
 * DSL 解析器实现
 * 将 MasterGo JSON DSL 解析为 AST
 */
export class DSLParser implements IDSLParser {
  /**
   * 解析 DSL 字符串为 AST
   */
  async parse(dsl: string): Promise<DSLAST> {
    // 验证 DSL
    const validation = this.validate(dsl);
    if (!validation.valid) {
      throw new Error(
        `DSL validation failed: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    // 解析 JSON
    const machineDSL: MachineDSL = JSON.parse(dsl);

    // 构建节点 Map
    const nodes = new Map<string, ASTNode>();
    let rootId = machineDSL.page.id;

    // 转换所有节点
    for (const node of machineDSL.nodes) {
      const astNode = this.convertNode(node, dsl);
      nodes.set(astNode.id, astNode);

      // 找到根节点（parentId 为 null 的节点）
      if (astNode.parentId === null && astNode.type !== 'page') {
        rootId = astNode.id;
      }
    }

    // 构建 AST
    const ast: DSLAST = {
      type: 'Document',
      page: {
        id: machineDSL.page.id,
        name: machineDSL.page.name,
        width: machineDSL.page.width,
        height: machineDSL.page.height,
      },
      nodes,
      root: rootId,
      metadata: {
        version: '1.0.0',
        source: 'MasterGo',
        parsedAt: new Date(),
      },
    };

    return ast;
  }

  /**
   * 验证 DSL 语法正确性
   */
  validate(dsl: string): ValidationResult {
    const errors: ValidationError[] = [];

    // 检查是否为空
    if (!dsl || dsl.trim() === '') {
      errors.push({
        code: 'EMPTY_DSL',
        message: 'DSL content is empty',
        severity: 'error',
      });
      return { valid: false, errors };
    }

    // 检查是否为有效 JSON
    try {
      const parsed = JSON.parse(dsl);

      // 检查必需字段
      if (!parsed.page) {
        errors.push({
          code: 'MISSING_PAGE',
          message: 'Missing required field: page',
          severity: 'error',
        });
      } else {
        // 验证 page 字段
        if (!parsed.page.id) {
          errors.push({
            code: 'MISSING_PAGE_ID',
            message: 'Missing required field: page.id',
            severity: 'error',
          });
        }
        if (!parsed.page.name) {
          errors.push({
            code: 'MISSING_PAGE_NAME',
            message: 'Missing required field: page.name',
            severity: 'error',
          });
        }
        if (typeof parsed.page.width !== 'number') {
          errors.push({
            code: 'INVALID_PAGE_WIDTH',
            message: 'Invalid field: page.width must be a number',
            severity: 'error',
          });
        }
        if (typeof parsed.page.height !== 'number') {
          errors.push({
            code: 'INVALID_PAGE_HEIGHT',
            message: 'Invalid field: page.height must be a number',
            severity: 'error',
          });
        }
      }

      if (!parsed.nodes) {
        errors.push({
          code: 'MISSING_NODES',
          message: 'Missing required field: nodes',
          severity: 'error',
        });
      } else if (!Array.isArray(parsed.nodes)) {
        errors.push({
          code: 'INVALID_NODES',
          message: 'Invalid field: nodes must be an array',
          severity: 'error',
        });
      }
    } catch (error) {
      errors.push({
        code: 'INVALID_JSON',
        message: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 遍历 AST
   */
  traverse(ast: DSLAST, visitor: ASTVisitor): void {
    // 访问文档
    if (visitor.visitDocument) {
      visitor.visitDocument(ast);
    }

    // 从根节点开始遍历
    this.traverseNode(ast, ast.root, null, visitor);
  }

  /**
   * 递归遍历节点
   */
  private traverseNode(
    ast: DSLAST,
    nodeId: string,
    parentNode: ASTNode | null,
    visitor: ASTVisitor
  ): void {
    const node = ast.nodes.get(nodeId);
    if (!node) return;

    // 访问节点
    if (visitor.visitNode) {
      visitor.visitNode(node, parentNode);
    }

    // 根据类型访问特定节点
    const typeVisitor = `visit${node.type.charAt(0).toUpperCase()}${node.type.slice(1)}` as keyof ASTVisitor;
    if (visitor[typeVisitor]) {
      (visitor[typeVisitor] as (node: ASTNode) => void)(node);
    }

    // 递归遍历子节点
    for (const childId of node.children) {
      this.traverseNode(ast, childId, node, visitor);
    }
  }

  /**
   * 转换节点为 AST 节点
   */
  private convertNode(node: any, dsl: string): ASTNode {
    // 计算位置信息（简化版，基于 JSON 字符串位置）
    const position: Position = this.calculatePosition(node.id, dsl);

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      parentId: node.parentId,
      children: node.children || [],
      layout: node.layout || {},
      style: node.style || {},
      content: node.content,
      meta: node.meta,
      position,
    };
  }

  /**
   * 计算节点在源 DSL 中的位置
   */
  private calculatePosition(nodeId: string, dsl: string): Position {
    const searchStr = `"id": "${nodeId}"`;
    const index = dsl.indexOf(searchStr);

    if (index === -1) {
      return { start: 0, end: 0, line: 1, column: 1 };
    }

    // 计算行号和列号
    const before = dsl.substring(0, index);
    const lines = before.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    return {
      start: index,
      end: index + searchStr.length,
      line,
      column,
    };
  }
}
