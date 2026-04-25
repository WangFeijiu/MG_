import { describe, it, expect, beforeEach } from 'vitest';
import { SectionAnalyzer } from './section-analyzer';
import type { DSLAST } from '@shared/types/ast';

describe('SectionAnalyzer', () => {
  let analyzer: SectionAnalyzer;

  beforeEach(() => {
    analyzer = new SectionAnalyzer();
  });

  describe('analyze', () => {
    it('should identify sections from AST', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test Page', width: 1440, height: 900 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['header', 'content'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'header',
            {
              id: 'header',
              type: 'container',
              name: 'Header',
              parentId: 'root',
              children: [],
              layout: { x: 0, y: 0, width: 1440, height: 80 },
              style: { background: '#fff' },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'content',
            {
              id: 'content',
              type: 'container',
              name: 'Content',
              parentId: 'root',
              children: [],
              layout: { x: 0, y: 120, width: 1440, height: 600 },
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);

      expect(sections).toHaveLength(2);
      expect(sections[0].rootNodeId).toBe('header');
      expect(sections[1].rootNodeId).toBe('content');
    });

    it('should detect section type from semantic names', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['nav'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'nav',
            {
              id: 'nav',
              type: 'container',
              name: 'Navigation Bar',
              parentId: 'root',
              children: [],
              layout: { x: 0, y: 0, width: 100, height: 50 },
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);

      expect(sections[0].type).toBe('navigation');
      expect(sections[0].metadata.detectedBy).toContain('semantic');
    });

    it('should calculate section bounds', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['section1'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'section1',
            {
              id: 'section1',
              type: 'container',
              parentId: 'root',
              children: [],
              layout: { x: 10, y: 20, width: 300, height: 400 },
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);

      expect(sections[0].bounds).toEqual({
        x: 10,
        y: 20,
        width: 300,
        height: 400,
      });
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate complexity score', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['section1'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'section1',
            {
              id: 'section1',
              type: 'container',
              parentId: 'root',
              children: ['child1', 'child2'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'child1',
            {
              id: 'child1',
              type: 'text',
              parentId: 'section1',
              children: [],
              layout: {},
              style: { color: '#000', fontSize: 16 },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'child2',
            {
              id: 'child2',
              type: 'button',
              parentId: 'section1',
              children: [],
              layout: {},
              style: { background: '#fff' },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);
      const section = sections[0];

      expect(section.complexity.total).toBeGreaterThan(0);
      expect(section.complexity.nodeCount).toBe(3); // section1 + child1 + child2
      expect(section.complexity.interactiveElements).toBe(1); // child2 is button
      expect(section.complexity.breakdown).toBeDefined();
    });

    it('should weight complexity factors correctly', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['section1'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'section1',
            {
              id: 'section1',
              type: 'container',
              parentId: 'root',
              children: [],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);
      const complexity = sections[0].complexity;

      // 验证权重：节点数 30% + 嵌套深度 20% + 样式多样性 20% + 交互元素 30%
      const total =
        complexity.breakdown.nodeCountScore +
        complexity.breakdown.nestingDepthScore +
        complexity.breakdown.styleDiversityScore +
        complexity.breakdown.interactiveScore;

      expect(Math.abs(total - complexity.total)).toBeLessThan(0.1);
    });
  });

  describe('generateManifest', () => {
    it('should generate section manifest', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test Page', width: 1440, height: 900 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['section1'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'section1',
            {
              id: 'section1',
              type: 'container',
              name: 'Header',
              parentId: 'root',
              children: [],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);
      const manifest = analyzer.generateManifest(ast, sections);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.pageId).toBe('page-1');
      expect(manifest.pageName).toBe('Test Page');
      expect(manifest.totalSections).toBe(1);
      expect(manifest.sections).toHaveLength(1);
      expect(manifest.statistics).toBeDefined();
      expect(manifest.statistics.totalNodes).toBeGreaterThan(0);
    });

    it('should calculate statistics correctly', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['header', 'footer'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'header',
            {
              id: 'header',
              type: 'container',
              name: 'Header',
              parentId: 'root',
              children: [],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'footer',
            {
              id: 'footer',
              type: 'container',
              name: 'Footer',
              parentId: 'root',
              children: [],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);
      const manifest = analyzer.generateManifest(ast, sections);

      expect(manifest.statistics.sectionTypes.header).toBe(1);
      expect(manifest.statistics.sectionTypes.footer).toBe(1);
      expect(manifest.statistics.averageComplexity).toBeGreaterThanOrEqual(0);
      expect(manifest.statistics.maxComplexity).toBeGreaterThanOrEqual(
        manifest.statistics.minComplexity
      );
    });
  });

  describe('detection methods', () => {
    it('should detect sections by hierarchy', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['section1'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'section1',
            {
              id: 'section1',
              type: 'container',
              parentId: 'root',
              children: [],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);

      expect(sections[0].metadata.detectedBy).toContain('hierarchy');
    });

    it('should detect sections by visual style', () => {
      const ast: DSLAST = {
        type: 'Document',
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: new Map([
          [
            'root',
            {
              id: 'root',
              type: 'container',
              parentId: null,
              children: ['section1'],
              layout: {},
              style: {},
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
          [
            'section1',
            {
              id: 'section1',
              type: 'container',
              parentId: 'root',
              children: [],
              layout: {},
              style: { background: '#f0f0f0', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
              position: { start: 0, end: 0, line: 1, column: 1 },
            },
          ],
        ]),
        root: 'root',
        metadata: { version: '1.0.0', source: 'Test', parsedAt: new Date() },
      };

      const sections = analyzer.analyze(ast);

      expect(sections[0].metadata.detectedBy).toContain('visual');
    });
  });
});
