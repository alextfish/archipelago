import { describe, it, expect } from "vitest";
import { FlowPuzzle } from "@model/puzzle/FlowPuzzle";
import type { FlowPuzzleSpec } from "@model/puzzle/FlowTypes";

describe("FlowPuzzle basic water propagation and blocking", () => {
  it("propagates water from edge inputs through outgoing channels", () => {
    const spec: FlowPuzzleSpec = {
      id: "flow1",
      size: { width: 3, height: 1 },
      islands: [],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E"] },
        { x: 2, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    expect(p.tileHasWater(0, 0)).toBe(true);
    expect(p.tileHasWater(1, 0)).toBe(true);
    expect(p.tileHasWater(2, 0)).toBe(true);
  });

  it("rocky tiles hold water but stop propagation", () => {
    const spec: FlowPuzzleSpec = {
      id: "flow-rocky",
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: "wood", colour: "black", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E"], rocky: true },
        { x: 2, y: 0, outgoing: ["E"] },
        { x: 3, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    expect(p.tileHasWater(0, 0)).toBe(true);
    expect(p.tileHasWater(1, 0)).toBe(true);
    expect(p.tileHasWater(2, 0)).toBe(false);
    expect(p.tileHasWater(3, 0)).toBe(false);
  });

  it("bridges act as dams and block downstream water", () => {
    const spec: FlowPuzzleSpec = {
      id: "flow-dam",
      size: { width: 5, height: 1 },
      islands: [
        { id: "L", x: 0, y: 0 },
        { id: "R", x: 4, y: 0 }
      ],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E"] },
        { x: 2, y: 0, outgoing: ["E"] },
        { x: 3, y: 0, outgoing: ["E"] },
        { x: 4, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    expect(p.tileHasWater(3, 0)).toBe(true);

    // simulate placing a vertical bridge covering x=2
    p.islands.push({ id: "A", x: 2, y: -1 });
    p.islands.push({ id: "B", x: 2, y: 2 });

    const b = p.takeBridgeOfType("wood");
    expect(b).toBeDefined();
    if (b && b.id) {
      p.placeBridge(b.id, { x: 2, y: -1 }, { x: 2, y: 2 });
    }

    // after bridge placed the tiles covered by that bridge are blocked and downstream drains
    expect(p.tileHasWater(2, 0)).toBe(false);
    expect(p.tileHasWater(3, 0)).toBe(false);
  });

  it("cannot place bridges over obstacle tiles", () => {
    const spec: FlowPuzzleSpec = {
      id: "flow-obstacle",
      size: { width: 3, height: 1 },
      islands: [{ id: "L", x: 0, y: 0 }, { id: "R", x: 2, y: 0 }],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"] },
        { x: 1, y: 0, outgoing: ["E"], obstacle: true },
        { x: 2, y: 0, outgoing: [] }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    const allowed = p.couldPlaceBridgeOfType("L", "R", "wood");
    expect(allowed).toBe(false);
  });
});
