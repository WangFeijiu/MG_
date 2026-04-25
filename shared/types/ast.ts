/**
 * DSL AST 类型定义
 * 抽象语法树的核心数据结构
 */

export interface DSLAST {
  type: 'Document';
  page: PageNode;
  nodes: Map<string, ASTNode>;
  root: string; // root node ID
  metadata: {
    version: string;
    source: string;
    parsedAt: Date;
  };
}

export interface PageNode {
  id: string;
  name: string;
  width: number;
  height: number;
}

export type ASTNodeType = 'page' | 'container' | 'text' | 'image' | 'button' | 'icon';

export interface ASTNode {
  id: string;
  type: ASTNodeType;
  name?: string;
  parentId: string | null;
  children: string[];
  layout: LayoutProperties;
  style: StyleProperties;
  content?: ContentProperties;
  meta?: MetaProperties;
  position: Position;
}

export interface LayoutProperties {
  mode?: 'absolute' | 'flex';
  direction?: 'row' | 'column';
  justify?: string;
  align?: string;
  wrap?: string;
  gap?: number;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  flexShrink?: number;
}

export interface StyleProperties {
  background?: string;
  backgroundImage?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: string;
  borderRadius?: BorderRadius;
  overflow?: 'visible' | 'hidden';
  padding?: Spacing;
  margin?: Spacing;
  objectFit?: 'fill' | 'contain' | 'cover';
  boxShadow?: string;
  border?: string;
}

export interface BorderRadius {
  linked: boolean;
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ContentProperties {
  text?: string;
  src?: string;
}

export interface MetaProperties {
  sourceNodeId?: string;
  componentHint?: string;
}

export interface Position {
  start: number;
  end: number;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  message: string;
  position?: Position;
  severity: 'error' | 'warning';
}

export interface ASTVisitor {
  visitDocument?(ast: DSLAST): void;
  visitNode?(node: ASTNode, parent: ASTNode | null): void;
  visitPage?(node: ASTNode): void;
  visitContainer?(node: ASTNode): void;
  visitText?(node: ASTNode): void;
  visitImage?(node: ASTNode): void;
  visitButton?(node: ASTNode): void;
  visitIcon?(node: ASTNode): void;
}
