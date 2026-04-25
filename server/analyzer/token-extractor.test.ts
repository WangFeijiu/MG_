import { describe, it, expect, beforeEach } from 'vitest';
import { TokenExtractor } from './token-extractor';
import type { DSLAST } from '@shared/types/ast';
import type { DesignTokens } from '@shared/types/tokens';

describe('TokenExtractor', () => {
  let extractor: TokenExtractor;

  beforeEach(() => {
    extractor = new TokenExtractor();
  });

  describe('extract', () => {
    it('should extract colors from AST', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'node-1',
            {
              id: 'node-1',
              type: 'text',
              parentId: null,
              children: [],
              layout: {},
              style: { color: '#FF0000', background: '#FFFFFF' },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'node-1',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const tokens = extractor.extract(ast);

      expect(tokens.colors.text.size).toBeGreaterThan(0);
      expect(tokens.colors.background.size).toBeGreaterThan(0);
    });

    it('should extract typography from AST', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'node-1',
            {
              id: 'node-1',
              type: 'text',
              parentId: null,
              children: [],
              layout: {},
              style: {
                fontSize: 16,
                fontWeight: 500,
                fontFamily: 'Arial',
                lineHeight: 1.5,
              },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'node-1',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const tokens = extractor.extract(ast);

      expect(tokens.typography.fontSizes.size).toBe(1);
      expect(tokens.typography.fontWeights.size).toBe(1);
      expect(tokens.typography.fontFamilies.size).toBe(1);
      expect(tokens.typography.lineHeights.size).toBe(1);
    });

    it('should extract spacing from AST', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'node-1',
            {
              id: 'node-1',
              type: 'container',
              parentId: null,
              children: [],
              layout: { gap: 16 },
              style: {
                padding: { top: 8, right: 16, bottom: 8, left: 16 },
                margin: { top: 0, right: 0, bottom: 0, left: 0 },
              },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'node-1',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const tokens = extractor.extract(ast);

      expect(tokens.spacing.padding.size).toBeGreaterThan(0);
      expect(tokens.spacing.margin.size).toBeGreaterThan(0);
      expect(tokens.spacing.gap.size).toBeGreaterThan(0);
    });

    it('should count token usage', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'node-1',
            {
              id: 'node-1',
              type: 'text',
              parentId: null,
              children: [],
              layout: {},
              style: { color: '#FF0000' },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'node-2',
            {
              id: 'node-2',
              type: 'text',
              parentId: null,
              children: [],
              layout: {},
              style: { color: '#FF0000' },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'node-1',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const tokens = extractor.extract(ast);
      const colorToken = Array.from(tokens.colors.text.values())[0];

      expect(colorToken.usage).toBe(2);
      expect(colorToken.nodes).toHaveLength(2);
    });
  });

  describe('clusterSimilarValues', () => {
    it('should cluster similar colors', () => {
      const colors = ['#FF0000', '#FF0101', '#00FF00'];
      const clusters = extractor.clusterSimilarValues(colors, 10);

      expect(clusters.size).toBe(2);
    });

    it('should not cluster dissimilar colors', () => {
      const colors = ['#FF0000', '#00FF00', '#0000FF'];
      const clusters = extractor.clusterSimilarValues(colors, 10);

      expect(clusters.size).toBe(3);
    });
  });

  describe('generateCSSVariables', () => {
    it('should generate CSS variables', () => {
      const tokens: DesignTokens = {
        colors: {
          primary: new Map([
            ['#FF0000', { value: '#FF0000', name: '1', usage: 1, nodes: ['node-1'] }],
          ]),
          text: new Map([
            ['#000000', { value: '#000000', name: '1', usage: 1, nodes: ['node-1'] }],
          ]),
          background: new Map([
            ['#FFFFFF', { value: '#FFFFFF', name: '1', usage: 1, nodes: ['node-1'] }],
          ]),
          border: new Map(),
        },
        typography: {
          fontSizes: new Map([['16', { value: 16, name: '1', usage: 1, nodes: ['node-1'] }]]),
          fontWeights: new Map(),
          fontFamilies: new Map(),
          lineHeights: new Map(),
        },
        spacing: {
          padding: new Map([['8', { value: 8, name: 'xs', usage: 1, nodes: ['node-1'] }]]),
          margin: new Map(),
          gap: new Map(),
        },
        borderRadius: {
          values: new Map([['4', { value: 4, name: 'sm', usage: 1, nodes: ['node-1'] }]]),
        },
        shadows: {
          values: new Map(),
        },
      };

      const css = extractor.generateCSSVariables(tokens);

      expect(css).toContain(':root {');
      expect(css).toContain('--color-primary-1: #FF0000;');
      expect(css).toContain('--color-text-1: #000000;');
      expect(css).toContain('--color-bg-1: #FFFFFF;');
      expect(css).toContain('--font-size-1: 16px;');
      expect(css).toContain('--spacing-xs: 8px;');
      expect(css).toContain('--radius-sm: 4px;');
      expect(css).toContain('}');
    });
  });

  describe('buildIndex', () => {
    it('should build token index', () => {
      const tokens: DesignTokens = {
        colors: {
          primary: new Map(),
          text: new Map([
            ['#000000', { value: '#000000', name: '1', usage: 1, nodes: ['node-1'] }],
          ]),
          background: new Map(),
          border: new Map(),
        },
        typography: {
          fontSizes: new Map([['16', { value: 16, name: '1', usage: 1, nodes: ['node-1'] }]]),
          fontWeights: new Map(),
          fontFamilies: new Map(),
          lineHeights: new Map(),
        },
        spacing: {
          padding: new Map(),
          margin: new Map(),
          gap: new Map(),
        },
        borderRadius: {
          values: new Map(),
        },
        shadows: {
          values: new Map(),
        },
      };

      const index = extractor.buildIndex(tokens);

      expect(index.byNode.size).toBe(1);
      expect(index.byType.size).toBe(5);

      const nodeTokens = index.byNode.get('node-1');
      expect(nodeTokens).toBeDefined();
      expect(nodeTokens?.colors).toHaveLength(1);
      expect(nodeTokens?.typography).toHaveLength(1);
    });
  });
});
