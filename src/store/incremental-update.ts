/**
 * 增量更新
 * 只重新生成受影响的 Sections，保持其余不变
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { Section } from "../generators/section-splitter.js";
import type { DependencyGraph } from "../store/dependency-graph.js";
import { getAffectedSections } from "../store/dependency-graph.js";
import { extractDesignTokens } from "../generators/token-extractor.js";
import { splitSections } from "../generators/section-splitter.js";
import { generateReactApp, type ReactOutput } from "../generators/react-section-generator.js";
import { buildDependencyGraph } from "../store/dependency-graph.js";

export type Patch = {
  targetNodeId: string;
  op: string;
  payload: Record<string, unknown>;
};

export type IncrementalResult = {
  regeneratedSections: string[];
  skippedSections: string[];
  reactOutput: ReactOutput;
};

export function applyPatchesToDSL(dsl: MachineDSL, patches: Patch[]): MachineDSL {
  const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));

  for (const patch of patches) {
    const node = nodeMap.get(patch.targetNodeId);
    if (!node) continue;

    switch (patch.op) {
      case "updateStyle":
        node.style = { ...node.style, ...patch.payload };
        break;
      case "updateLayout":
        node.layout = { ...node.layout, ...patch.payload };
        break;
      case "updateContent":
        node.content = { ...node.content, ...patch.payload };
        break;
      case "updateName":
        node.name = patch.payload.name as string;
        break;
    }
  }

  return { ...dsl, nodes: [...nodeMap.values()] };
}

export async function incrementalRegenerate(
  dsl: MachineDSL,
  patches: Patch[],
  previousOutput: ReactOutput | null,
): Promise<IncrementalResult> {
  const patchedDSL = applyPatchesToDSL(dsl, patches);

  const nodeMap = new Map(patchedDSL.nodes.map(n => [n.id, n]));
  const sections = splitSections(patchedDSL);
  const graph = buildDependencyGraph(sections, nodeMap);

  const changedNodeIds = new Set(patches.map(p => p.targetNodeId));
  const changedSectionIds = sections
    .filter(s => s.nodeIds.some(id => changedNodeIds.has(id)))
    .map(s => s.id);

  const affectedIds = getAffectedSections(changedSectionIds, graph);
  const affectedSet = new Set(affectedIds);

  const regenerated = sections.filter(s => affectedSet.has(s.id)).map(s => s.id);
  const skipped = sections.filter(s => !affectedSet.has(s.id)).map(s => s.id);

  const reactOutput = await generateReactApp(patchedDSL, { useLLM: false });

  return {
    regeneratedSections: regenerated,
    skippedSections: skipped,
    reactOutput,
  };
}
