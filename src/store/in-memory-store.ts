import type { MachineDSL } from "../../types/machine-dsl.js";
import type { Section } from "../section-splitter.js";
import type { DesignTokens } from "../token-extractor.js";
import type { ReactOutput } from "../react-section-generator.js";

export type SessionData = {
  dsl: MachineDSL | null;
  sections: Section[];
  tokens: DesignTokens | null;
  reactOutput: ReactOutput | null;
  patches: PatchEntry[];
};

export type PatchEntry = {
  id: string;
  targetNodeId: string;
  op: string;
  payload: Record<string, unknown>;
  appliedAt: string;
};

const INITIAL_STATE: SessionData = {
  dsl: null,
  sections: [],
  tokens: null,
  reactOutput: null,
  patches: [],
};

export class InMemoryStore {
  private data: SessionData;
  private listeners: Array<(data: SessionData) => void> = [];

  constructor() {
    this.data = { ...INITIAL_STATE };
  }

  getDSL(): MachineDSL | null {
    return this.data.dsl;
  }

  setDSL(dsl: MachineDSL): void {
    this.data.dsl = dsl;
    this.notify();
  }

  getSections(): Section[] {
    return this.data.sections;
  }

  setSections(sections: Section[]): void {
    this.data.sections = sections;
    this.notify();
  }

  getTokens(): DesignTokens | null {
    return this.data.tokens;
  }

  setTokens(tokens: DesignTokens): void {
    this.data.tokens = tokens;
    this.notify();
  }

  getReactOutput(): ReactOutput | null {
    return this.data.reactOutput;
  }

  setReactOutput(output: ReactOutput): void {
    this.data.reactOutput = output;
    this.notify();
  }

  getPatches(): PatchEntry[] {
    return this.data.patches;
  }

  addPatch(patch: PatchEntry): void {
    this.data.patches.push(patch);
    this.notify();
  }

  clearPatches(): void {
    this.data.patches = [];
    this.notify();
  }

  reset(): void {
    this.data = { ...INITIAL_STATE, patches: [] };
    this.notify();
  }

  getSnapshot(): Readonly<SessionData> {
    return this.data;
  }

  onChange(listener: (data: SessionData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }
}
