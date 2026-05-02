import { describe, it, expect } from "vitest";
import { convertMasterGoToMachine } from "../mastergo-to-machine.js";
import type { MachineDSL, DSLNode } from "../../types/machine-dsl.js";

function makeNode(overrides: Record<string, any> = {}): any {
  return {
    type: "FRAME",
    id: "n1",
    name: "Node",
    layoutStyle: { width: 100, height: 50, relativeX: 0, relativeY: 0 },
    ...overrides,
  };
}

function makeDSL(nodes: any[], styles: Record<string, any> = {}): any {
  return { dsl: { styles, nodes, components: [] } };
}

describe("convertMasterGoToMachine", () => {
  it("throws when root node is missing", () => {
    expect(() => convertMasterGoToMachine(makeDSL([]))).toThrow(
      "No root node found in MasterGo DSL",
    );
  });

  it("sets page metadata from root node", () => {
    const root = makeNode({ id: "root", name: "Landing Page", layoutStyle: { width: 1440, height: 3000, relativeX: 0, relativeY: 0 } });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.page.id).toBe("root");
    expect(result.page.name).toBe("Landing Page");
    expect(result.page.width).toBe(1440);
    expect(result.page.height).toBe(3000);
  });

  // --- Node type mapping ---

  it("maps TEXT node to type text", () => {
    const root = makeNode({
      children: [makeNode({ type: "TEXT", id: "t1", name: "Title", text: [{ text: "Hello", font: "" }] })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.type).toBe("text");
  });

  it("maps PATH node to type icon", () => {
    const root = makeNode({
      children: [makeNode({ type: "PATH", id: "p1", name: "Arrow" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const pathNode = result.nodes.find(n => n.id === "p1");
    expect(pathNode?.type).toBe("icon");
  });

  it("maps FRAME node to type container", () => {
    const root = makeNode({ type: "FRAME", id: "f1" });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].type).toBe("container");
  });

  it("maps LAYER with HTTP fill to type image", () => {
    const styles = { "fill-ref": { value: [{ url: "https://img.example.com/photo.jpg" }] } };
    const root = makeNode({
      children: [makeNode({ type: "LAYER", id: "l1", name: "Photo", fill: "fill-ref" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const layerNode = result.nodes.find(n => n.id === "l1");
    expect(layerNode?.type).toBe("image");
    expect(layerNode?.content?.src).toBe("https://img.example.com/photo.jpg");
  });

  // --- Layout: flex vs absolute ---

  it("uses flex layout when children are row-aligned", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 0, relativeY: 5 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 60, relativeY: 5 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 120, relativeY: 5 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].layout.mode).toBe("flex");
    expect(result.nodes[0].layout.direction).toBe("row");
    expect(result.nodes[0].layout.align).toBe("center");
    expect(result.nodes[0].layout.justify).toBe("flex-start");
  });

  it("uses flex layout when children are column-aligned", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "column" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 100, height: 30, relativeX: 5, relativeY: 0 } }),
        makeNode({ id: "c2", layoutStyle: { width: 100, height: 30, relativeX: 5, relativeY: 40 } }),
        makeNode({ id: "c3", layoutStyle: { width: 100, height: 30, relativeX: 5, relativeY: 80 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].layout.mode).toBe("flex");
    expect(result.nodes[0].layout.direction).toBe("column");
  });

  it("falls back to absolute layout when fewer than 2 children", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row" },
      children: [makeNode({ id: "c1" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].layout.mode).toBe("absolute");
  });

  it("sets x/y for absolute-positioned nodes", () => {
    const root = makeNode({
      children: [makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 20, relativeY: 40 } })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const child = result.nodes.find(n => n.id === "c1");
    expect(child?.layout.x).toBe(20);
    expect(child?.layout.y).toBe(40);
  });

  it("preserves flexShrink when defined", () => {
    const root = makeNode({
      children: [makeNode({ id: "c1", flexShrink: 0 })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const child = result.nodes.find(n => n.id === "c1");
    expect(child?.layout.flexShrink).toBe(0);
  });

  // --- Flex properties ---

  it("parses flex wrap property", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", flexWrap: "wrap" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 0, relativeY: 0 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 60, relativeY: 0 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 120, relativeY: 0 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].layout.wrap).toBe("wrap");
  });

  it("parses single-value gap string", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", gap: "24px" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 0, relativeY: 0 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 74, relativeY: 0 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 148, relativeY: 0 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].layout.gap).toBe(24);
  });

  it("parses two-value gap string taking first value", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", gap: "24px 80px" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 0, relativeY: 0 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 130, relativeY: 0 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 260, relativeY: 0 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].layout.gap).toBe(24);
  });

  // --- Padding ---

  it("parses 1-value padding to uniform Spacing", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", padding: "20px" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 20, relativeY: 20 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 80, relativeY: 20 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 140, relativeY: 20 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].style.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });

  it("parses 2-value padding to vertical/horizontal", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", padding: "80px 40px" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 40, relativeY: 80 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 100, relativeY: 80 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 160, relativeY: 80 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].style.padding).toEqual({ top: 80, right: 40, bottom: 80, left: 40 });
  });

  it("parses 4-value padding to individual values", () => {
    const root = makeNode({
      flexContainerInfo: { flexDirection: "row", padding: "10px 20px 30px 40px" },
      children: [
        makeNode({ id: "c1", layoutStyle: { width: 50, height: 30, relativeX: 40, relativeY: 10 } }),
        makeNode({ id: "c2", layoutStyle: { width: 50, height: 30, relativeX: 100, relativeY: 10 } }),
        makeNode({ id: "c3", layoutStyle: { width: 50, height: 30, relativeX: 160, relativeY: 10 } }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].style.padding).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
  });

  // --- Fill / background ---

  it("resolves solid color fill to style.background", () => {
    const styles = { "color-ref": { value: "#ff5500" } };
    const root = makeNode({ fill: "color-ref" });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    expect(result.nodes[0].style.background).toBe("#ff5500");
  });

  it("resolves HTTP URL fill to style.backgroundImage", () => {
    const styles = { "img-ref": { value: [{ url: "https://cdn.example.com/bg.png" }] } };
    const root = makeNode({ fill: "img-ref" });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    expect(result.nodes[0].style.backgroundImage).toBe("https://cdn.example.com/bg.png");
  });

  it("handles missing style reference gracefully", () => {
    const root = makeNode({ fill: "nonexistent-ref" });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].style.background).toBeUndefined();
    expect(result.nodes[0].style.backgroundImage).toBeUndefined();
  });

  // --- Border / stroke ---

  it("sets border from strokeColor + strokeWidth", () => {
    const styles = { "stroke-ref": { value: "#cccccc" } };
    const root = makeNode({ strokeColor: "stroke-ref", strokeWidth: "2" });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    expect(result.nodes[0].style.border).toBe("2px solid #cccccc");
  });

  it("sets strokeAlign when present", () => {
    const styles = { "stroke-ref": { value: "#cccccc" } };
    const root = makeNode({ strokeColor: "stroke-ref", strokeWidth: "1", strokeAlign: "inside" });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    expect(result.nodes[0].style.strokeAlign).toBe("inside");
  });

  it("skips border when strokeColor is missing", () => {
    const root = makeNode({ strokeWidth: "2" });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].style.border).toBeUndefined();
  });

  // --- Border radius ---

  it("parses borderRadius to linked BorderRadius object", () => {
    const root = makeNode({ borderRadius: "12" });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].style.borderRadius).toEqual({
      linked: true,
      topLeft: 12,
      topRight: 12,
      bottomRight: 12,
      bottomLeft: 12,
    });
    expect(result.nodes[0].style.overflow).toBe("hidden");
  });

  // --- Text content ---

  it("joins multiple text segments", () => {
    const root = makeNode({
      type: "FRAME",
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Multi",
          text: [{ text: "Hello ", font: "" }, { text: "World", font: "" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.content?.text).toBe("Hello World");
  });

  it("resolves text color from first textColor entry", () => {
    const styles = { "tc-ref": { value: "#333333" } };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Colored",
          text: [{ text: "Hi", font: "" }],
          textColor: [{ start: 0, end: 2, color: "tc-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.color).toBe("#333333");
  });

  it("stores textColorRanges in meta when multiple colors exist", () => {
    const styles = {
      "tc1": { value: "#333333" },
      "tc2": { value: "#ff0000" },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "MultiColor",
          text: [{ text: "Hello World", font: "" }],
          textColor: [
            { start: 0, end: 5, color: "tc1" },
            { start: 6, end: 11, color: "tc2" },
          ],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.meta?.textColorRanges).toHaveLength(2);
    expect(textNode?.meta?.textColorRanges?.[0].color).toBe("#333333");
    expect(textNode?.meta?.textColorRanges?.[1].color).toBe("#ff0000");
  });

  it("maps font weight SemiBold to 600", () => {
    const styles = {
      "font-ref": { value: { size: 16, family: "Inter", lineHeight: "24", style: '{"fontStyle":"SemiBold"}' } },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Title",
          text: [{ text: "Title", font: "font-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.fontWeight).toBe(600);
  });

  it("maps font weight Bold to 700", () => {
    const styles = {
      "font-ref": { value: { size: 14, family: "Inter", lineHeight: "20", style: '{"fontStyle":"Bold"}' } },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Bold",
          text: [{ text: "Bold", font: "font-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.fontWeight).toBe(700);
  });

  it("sets fontSize, fontFamily, lineHeight from style reference", () => {
    const styles = {
      "font-ref": { value: { size: 24, family: "Roboto", lineHeight: "32", style: '{"fontStyle":"Regular"}' } },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Heading",
          text: [{ text: "Heading", font: "font-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.fontSize).toBe(24);
    expect(textNode?.style.fontFamily).toBe("Roboto");
    expect(textNode?.style.lineHeight).toBe(32);
  });

  it("sets letterSpacing from style reference", () => {
    const styles = {
      "font-ref": { value: { size: 14, family: "Inter", lineHeight: "20", letterSpacing: "0.5", style: '{"fontStyle":"Regular"}' } },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Spaced",
          text: [{ text: "Spaced", font: "font-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.letterSpacing).toBe(0.5);
  });

  it("handles invalid font style JSON gracefully", () => {
    const styles = {
      "font-ref": { value: { size: 14, family: "Inter", lineHeight: "20", style: "not-json" } },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Text",
          text: [{ text: "Text", font: "font-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.fontWeight).toBeUndefined();
  });

  it("preserves textAlign", () => {
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Centered",
          text: [{ text: "Center", font: "" }],
          textAlign: "center",
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.style.textAlign).toBe("center");
  });

  // --- PATH / SVG ---

  it("stores svgPaths in meta for PATH nodes with path data", () => {
    const styles = { "path-fill": { value: "#000000" } };
    const root = makeNode({
      children: [
        makeNode({
          type: "PATH", id: "p1", name: "Icon",
          path: [{ fill: "path-fill", data: "M10 10 L20 20" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const pathNode = result.nodes.find(n => n.id === "p1");
    expect(pathNode?.meta?.svgPaths).toHaveLength(1);
    expect(pathNode?.meta?.svgPaths?.[0].fill).toBe("#000000");
    expect(pathNode?.meta?.svgPaths?.[0].data).toBe("M10 10 L20 20");
  });

  // --- Semantic classification ---

  it("classifies node named submit-button as button", () => {
    const root = makeNode({ name: "submit-button" });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].meta?.semanticType).toBe("button");
  });

  it("classifies node named search-input as input", () => {
    const root = makeNode({
      children: [makeNode({ id: "c1", name: "search-input" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const child = result.nodes.find(n => n.id === "c1");
    expect(child?.meta?.semanticType).toBe("input");
  });

  it("classifies node named user-card as card", () => {
    const root = makeNode({
      children: [makeNode({ id: "c1", name: "user-card" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const child = result.nodes.find(n => n.id === "c1");
    expect(child?.meta?.semanticType).toBe("card");
  });

  it("classifies node named main-nav as navbar", () => {
    const root = makeNode({
      children: [makeNode({ id: "c1", name: "main-nav" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const child = result.nodes.find(n => n.id === "c1");
    expect(child?.meta?.semanticType).toBe("navbar");
  });

  it("classifies TEXT node with no keyword match as text", () => {
    const root = makeNode({
      children: [makeNode({ type: "TEXT", id: "t1", name: "paragraph-content", text: [{ text: "Hi", font: "" }] })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.meta?.semanticType).toBe("text");
  });

  it("classifies FRAME node with no keyword match as container", () => {
    const root = makeNode({
      children: [makeNode({ id: "c1", name: "wrapper-section" })],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const child = result.nodes.find(n => n.id === "c1");
    expect(child?.meta?.semanticType).toBe("container");
  });

  // --- Recursive children ---

  it("recursively converts nested children with correct parentId", () => {
    const root = makeNode({
      id: "root",
      children: [
        makeNode({
          id: "parent",
          children: [makeNode({ id: "child" })],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const parentNode = result.nodes.find(n => n.id === "parent");
    const childNode = result.nodes.find(n => n.id === "child");
    expect(parentNode?.parentId).toBe("root");
    expect(childNode?.parentId).toBe("parent");
    expect(parentNode?.children).toContain("child");
  });

  // --- Meta fields ---

  it("stores effectRef in meta when effect is present", () => {
    const root = makeNode({ effect: "shadow-ref-1" });
    const result = convertMasterGoToMachine(makeDSL([root]));
    expect(result.nodes[0].meta?.effectRef).toBe("shadow-ref-1");
  });

  it("stores textMode in meta when present", () => {
    const root = makeNode({
      children: [
        makeNode({ type: "TEXT", id: "t1", name: "Auto", text: [{ text: "Hi", font: "" }], textMode: "auto-height" }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root]));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.meta?.textMode).toBe("auto-height");
  });

  it("stores fontRef in meta when font reference exists", () => {
    const styles = {
      "font-ref": { value: { size: 14, family: "Inter", lineHeight: "20", style: '{"fontStyle":"Regular"}' } },
    };
    const root = makeNode({
      children: [
        makeNode({
          type: "TEXT", id: "t1", name: "Text",
          text: [{ text: "Hello", font: "font-ref" }],
        }),
      ],
    });
    const result = convertMasterGoToMachine(makeDSL([root], styles));
    const textNode = result.nodes.find(n => n.id === "t1");
    expect(textNode?.meta?.fontRef).toBe("font-ref");
  });
});
