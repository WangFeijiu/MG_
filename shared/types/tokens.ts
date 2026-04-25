/**
 * Design Tokens 类型定义
 * 用于存储从 DSL 中提取的设计令牌
 */

export interface DesignTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  borderRadius: BorderRadiusTokens;
  shadows: ShadowTokens;
}

export interface ColorTokens {
  primary: Map<string, ColorToken>;
  text: Map<string, ColorToken>;
  background: Map<string, ColorToken>;
  border: Map<string, ColorToken>;
}

export interface ColorToken {
  value: string;
  name: string;
  usage: number;
  nodes: string[];
}

export interface TypographyTokens {
  fontSizes: Map<string, TypographyToken>;
  fontWeights: Map<string, TypographyToken>;
  fontFamilies: Map<string, TypographyToken>;
  lineHeights: Map<string, TypographyToken>;
}

export interface TypographyToken {
  value: string | number;
  name: string;
  usage: number;
  nodes: string[];
}

export interface SpacingTokens {
  padding: Map<string, SpacingToken>;
  margin: Map<string, SpacingToken>;
  gap: Map<string, SpacingToken>;
}

export interface SpacingToken {
  value: number;
  name: string;
  usage: number;
  nodes: string[];
}

export interface BorderRadiusTokens {
  values: Map<string, BorderRadiusToken>;
}

export interface BorderRadiusToken {
  value: number | string;
  name: string;
  usage: number;
  nodes: string[];
}

export interface ShadowTokens {
  values: Map<string, ShadowToken>;
}

export interface ShadowToken {
  value: string;
  name: string;
  usage: number;
  nodes: string[];
}

export interface TokenIndex {
  byNode: Map<string, NodeTokens>;
  byType: Map<TokenType, Set<string>>;
}

export interface NodeTokens {
  nodeId: string;
  colors: string[];
  typography: string[];
  spacing: string[];
  borderRadius: string[];
  shadows: string[];
}

export type TokenType = 'color' | 'typography' | 'spacing' | 'borderRadius' | 'shadow';
