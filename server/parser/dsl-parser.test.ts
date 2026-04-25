import { describe, it, expect, beforeEach } from 'vitest';
import { DSLParser } from './dsl-parser';
import type { DSLAST, ASTVisitor } from '@shared/types/ast';

describe('DSLParser', () => {
  let parser: DSLParser;

  beforeEach(() => {
    parser = new DSLParser();
  });

  describe('validate', () => {
    it('should validate empty DSL', () => {
      const result = parser.validate('');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EMPTY_DSL');
    });

    it('should validate invalid JSON', () => {
      const result = parser.validate('{ invalid json }');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_JSON');
    });

    it('should validate missing page field', () => {
      const dsl = JSON.stringify({ nodes: [] });
      const result = parser.validate(dsl);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_PAGE')).toBe(true);
    });

    it('should validate missing nodes field', () => {
      const dsl = JSON.stringify({
        page: { id: '1', name: 'Test', width: 100, height: 100 },
      });
      const result = parser.validate(dsl);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_NODES')).toBe(true);
    });

    it('should validate valid DSL', () => {
      const dsl = JSON.stringify({
        page: { id: '1', name: 'Test', width: 100, height: 100 },
        nodes: [],
      });
      const result = parser.validate(dsl);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate invalid page width', () => {
      const dsl = JSON.stringify({
        page: { id: '1', name: 'Test', width: 'invalid', height: 100 },
        nodes: [],
      });
      const result = parser.validate(dsl);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_PAGE_WIDTH')).toBe(true);
    });
  });

  describe('parse', () => {
    it('should throw error for invalid DSL', async () => {
      await expect(parser.parse('')).rejects.toThrow('DSL validation failed');
    });

    it('should parse minimal valid DSL', async () => {
      const dsl = JSON.stringify({
        page: { id: 'page-1', name: 'Test Page', width: 1440, height: 900 },
        nodes: [],
      });

      const ast = await parser.parse(dsl);

      expect(ast.type).toBe('Document');
      expect(ast.page.id).toBe('page-1');
      expect(ast.page.name).toBe('Test Page');
      expect(ast.page.width).toBe(1440);
      expect(ast.page.height).toBe(900);
      expect(ast.nodes.size).toBe(0);
      expect(ast.metadata.version).toBe('1.0.0');
      expect(ast.metadata.source).toBe('MasterGo');
    });

    it('should parse DSL with nodes', async () => {
      const dsl = JSON.stringify({
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: [
          {
            id: 'node-1',
            type: 'container',
            name: 'Container',
            parentId: null,
            children: ['node-2'],
            layout: { x: 0, y: 0, width: 100, height: 100 },
            style: { background: '#fff' },
          },
          {
            id: 'node-2',
            type: 'text',
            name: 'Text',
            parentId: 'node-1',
            children: [],
            layout: { x: 10, y: 10, width: 80, height: 20 },
            style: { color: '#000', fontSize: 16 },
            content: { text: 'Hello' },
          },
        ],
      });

      const ast = await parser.parse(dsl);

      expect(ast.nodes.size).toBe(2);
      expect(ast.root).toBe('node-1');

      const node1 = ast.nodes.get('node-1');
      expect(node1).toBeDefined();
      expect(node1?.type).toBe('container');
      expect(node1?.children).toEqual(['node-2']);
      expect(node1?.parentId).toBeNull();

      const node2 = ast.nodes.get('node-2');
      expect(node2).toBeDefined();
      expect(node2?.type).toBe('text');
      expect(node2?.parentId).toBe('node-1');
      expect(node2?.content?.text).toBe('Hello');
    });

    it('should calculate position information', async () => {
      const dsl = JSON.stringify({
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: [
          {
            id: 'node-1',
            type: 'container',
            parentId: null,
            children: [],
          },
        ],
      });

      const ast = await parser.parse(dsl);
      const node = ast.nodes.get('node-1');

      expect(node?.position).toBeDefined();
      expect(node?.position.start).toBeGreaterThanOrEqual(0);
      expect(node?.position.line).toBeGreaterThan(0);
    });
  });

  describe('traverse', () => {
    it('should traverse empty AST', async () => {
      const dsl = JSON.stringify({
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: [],
      });

      const ast = await parser.parse(dsl);
      const visited: string[] = [];

      parser.traverse(ast, {
        visitDocument: () => visited.push('document'),
      });

      expect(visited).toEqual(['document']);
    });

    it('should traverse AST with nodes', async () => {
      const dsl = JSON.stringify({
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: [
          {
            id: 'node-1',
            type: 'container',
            parentId: null,
            children: ['node-2', 'node-3'],
          },
          {
            id: 'node-2',
            type: 'text',
            parentId: 'node-1',
            children: [],
          },
          {
            id: 'node-3',
            type: 'image',
            parentId: 'node-1',
            children: [],
          },
        ],
      });

      const ast = await parser.parse(dsl);
      const visited: string[] = [];

      parser.traverse(ast, {
        visitDocument: () => visited.push('document'),
        visitNode: (node) => visited.push(node.id),
        visitContainer: (node) => visited.push(`container:${node.id}`),
        visitText: (node) => visited.push(`text:${node.id}`),
        visitImage: (node) => visited.push(`image:${node.id}`),
      });

      expect(visited).toContain('document');
      expect(visited).toContain('node-1');
      expect(visited).toContain('node-2');
      expect(visited).toContain('node-3');
      expect(visited).toContain('container:node-1');
      expect(visited).toContain('text:node-2');
      expect(visited).toContain('image:node-3');
    });

    it('should traverse in correct order (depth-first)', async () => {
      const dsl = JSON.stringify({
        page: { id: 'page-1', name: 'Test', width: 100, height: 100 },
        nodes: [
          {
            id: 'root',
            type: 'container',
            parentId: null,
            children: ['child1', 'child2'],
          },
          {
            id: 'child1',
            type: 'container',
            parentId: 'root',
            children: ['grandchild1'],
          },
          {
            id: 'grandchild1',
            type: 'text',
            parentId: 'child1',
            children: [],
          },
          {
            id: 'child2',
            type: 'text',
            parentId: 'root',
            children: [],
          },
        ],
      });

      const ast = await parser.parse(dsl);
      const visited: string[] = [];

      parser.traverse(ast, {
        visitNode: (node) => visited.push(node.id),
      });

      // 深度优先：root -> child1 -> grandchild1 -> child2
      expect(visited).toEqual(['root', 'child1', 'grandchild1', 'child2']);
    });
  });
});
