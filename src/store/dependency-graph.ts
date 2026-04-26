import type { Section } from "../generators/section-splitter.js";
import type { DSLNode } from "../types/machine-dsl.js";

export type DependencyGraph = {
  sections: Map<string, Set<string>>;
  reverseDeps: Map<string, Set<string>>;
};

export function buildDependencyGraph(
  sections: Section[],
  nodeMap: Map<string, DSLNode>,
): DependencyGraph {
  const deps = new Map<string, Set<string>>();
  const reverseDeps = new Map<string, Set<string>>();

  const sectionById = new Map<string, Section>();
  const nodeToSection = new Map<string, string>();

  for (const section of sections) {
    deps.set(section.id, new Set());
    reverseDeps.set(section.id, new Set());
    sectionById.set(section.id, section);
    for (const nodeId of section.nodeIds) {
      nodeToSection.set(nodeId, section.id);
    }
  }

  for (const section of sections) {
    for (const nodeId of section.nodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      if (node.parentId && nodeToSection.has(node.parentId)) {
        const parentSection = nodeToSection.get(node.parentId)!;
        if (parentSection !== section.id) {
          deps.get(section.id)!.add(parentSection);
          reverseDeps.get(parentSection)!.add(section.id);
        }
      }

      for (const childId of node.children) {
        if (nodeToSection.has(childId)) {
          const childSection = nodeToSection.get(childId)!;
          if (childSection !== section.id) {
            deps.get(section.id)!.add(childSection);
            reverseDeps.get(childSection)!.add(section.id);
          }
        }
      }
    }
  }

  return { sections: deps, reverseDeps };
}

export function getAffectedSections(
  changedSectionIds: string[],
  graph: DependencyGraph,
): string[] {
  const visited = new Set<string>();
  const queue = [...changedSectionIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = graph.reverseDeps.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  return topologicalSort(visited, graph);
}

export function topologicalSort(
  sectionIds: Set<string> | string[],
  graph: DependencyGraph,
): string[] {
  const ids = Array.isArray(sectionIds) ? sectionIds : [...sectionIds];
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const deps = graph.sections.get(id);
    if (deps) {
      for (const dep of deps) {
        if (ids.includes(dep)) {
          visit(dep);
        }
      }
    }
    result.push(id);
  }

  for (const id of ids) {
    visit(id);
  }

  return result;
}
