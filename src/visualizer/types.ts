// ========== Visualizer Event Types ==========

export type PipelineStartPayload = {
  sectionCount: number;
  pageName: string;
  pageWidth: number;
  pageHeight: number;
};

export type SectionStartPayload = {
  id: string;
  name: string;
  index: number;
  total: number;
  yPosition: number;
  height: number;
  semanticGuess: string;
};

export type SectionCompletePayload = {
  id: string;
  name: string;
  kind: string;
  index: number;
  diffPercent: number;
  areas: Array<{ x: number; y: number; width: number; height: number }>;
  features: string[];
  generatedScreenshot: string;
  baselineScreenshot: string;
  diffOverlay: string;
  converged: boolean;
  duration: number;
};

export type PipelineCompletePayload = {
  totalHTMLDiff: number;
  allConverged: boolean;
  sectionCount: number;
  convergedCount: number;
  totalDuration: number;
};

export type VisualizerEvent =
  | { type: "pipeline:start"; data: PipelineStartPayload }
  | { type: "section:start"; data: SectionStartPayload }
  | { type: "section:complete"; data: SectionCompletePayload }
  | { type: "pipeline:complete"; data: PipelineCompletePayload }
  | { type: "pipeline:error"; data: { message: string } };

export type EventCallback = (event: VisualizerEvent) => void;
