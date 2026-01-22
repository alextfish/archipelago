import { describe, it, expect } from "vitest";
import { FlowPuzzle } from "@model/puzzle/FlowPuzzle";
import { MustHaveWaterConstraint } from "@model/puzzle/constraints/MustHaveWaterConstraint";
import type { FlowPuzzleSpec } from "@model/puzzle/FlowTypes";

describe("MustHaveWaterConstraint", () => {
  it("reports violation when tile does not have water", () => {
    const spec: FlowPuzzleSpec = {
      id: "mustwater",
      size: { width: 2, height: 1 },
      islands: [],
      bridgeTypes: [{ id: "wood", colour: "black", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [{ type: "MustHaveWaterConstraint", params: { x: 1, y: 0 } }],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);

    expect(p.tileHasWater(1, 0)).toBe(true);

    // place vertical bridge to block tile 1
    p.islands.push({ id: "A", x: 0, y: -1 });
    p.islands.push({ id: "B", x: 0, y: 2 });
    const b = p.takeBridgeOfType("wood");
    if (b && b.id) p.placeBridge(b.id, { x: 0, y: -1 }, { x: 0, y: 2 });

    const c = new MustHaveWaterConstraint(1, 0);
    const result = c.check(p);
    expect(result.satisfied).toBe(false);
  });

  it("passes when tile has water", () => {
    const spec: FlowPuzzleSpec = {
      id: "mustwater2",
      size: { width: 2, height: 1 },
      islands: [],
      bridgeTypes: [{ id: "wood", colour: "black", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [{ type: "MustHaveWaterConstraint", params: { x: 1, y: 0 } }],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    const c = new MustHaveWaterConstraint(1, 0);
    const r = c.check(p);
    expect(r.satisfied).toBe(true);
  });
});
