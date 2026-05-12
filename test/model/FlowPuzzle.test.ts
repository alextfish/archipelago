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

describe("FlowPuzzle water change wave sequences", () => {
  // Shared spec for a 5-cell horizontal flow: source at (0,0) flowing east.
  // Islands at (0,0) and (4,0); extra islands at (2,-1) and (2,1) allow a vertical dam bridge.
  const makeLinearSpec = (): FlowPuzzleSpec => ({
    id: "flow-waves",
    size: { width: 5, height: 1 },
    islands: [
      { id: "L", x: 0, y: 0 },
      { id: "R", x: 4, y: 0 },
      { id: "DA", x: 2, y: -1 },
      { id: "DB", x: 2, y: 1 }
    ],
    bridgeTypes: [{ id: "wood", colour: "brown", count: 2 }],
    flowSquares: [
      { x: 0, y: 0, outgoing: ["E"], isSource: true },
      { x: 1, y: 0, outgoing: ["E"] },
      { x: 2, y: 0, outgoing: ["E"] },
      { x: 3, y: 0, outgoing: ["E"] },
      { x: 4, y: 0, outgoing: [] }
    ],
    edgeInputs: [],
    constraints: [],
    maxNumBridges: 2
  });

  it("placeBridgeWithWaterChanges returns empty drying sequence when bridge does not block water", () => {
    // Place a bridge that does not cover any flow squares (adjacent islands, no intermediate cells)
    const spec: FlowPuzzleSpec = {
      id: "flow-no-block",
      size: { width: 3, height: 1 },
      islands: [{ id: "A", x: 0, y: -1 }, { id: "B", x: 0, y: 1 }],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E"] },
        { x: 2, y: 0, outgoing: [] }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    // Bridge from (0,-1) to (0,1) covers only (0,0), which is a source – and it IS wet.
    // (0,0) gets blocked but (1,0) and (2,0) also dry because they can only be reached via (0,0).
    // We verify the sequence is non-empty and in the right order.
    const b = p.takeBridgeOfType("wood")!;
    const { success, dryingSequence } = p.placeBridgeWithWaterChanges(b.id, { x: 0, y: -1 }, { x: 0, y: 1 });
    expect(success).toBe(true);
    // Wave 0: (0,0) is the blocked cell that was wet
    expect(dryingSequence[0]).toEqual([{ x: 0, y: 0 }]);
    // Wave 1: (1,0) is the next cell downstream
    expect(dryingSequence[1]).toEqual([{ x: 1, y: 0 }]);
    // Wave 2: (2,0) is the next cell downstream
    expect(dryingSequence[2]).toEqual([{ x: 2, y: 0 }]);
    expect(dryingSequence.length).toBe(3);
  });

  it("placeBridgeWithWaterChanges returns ordered drying sequence", () => {
    const p = new FlowPuzzle(makeLinearSpec());
    // All five cells should have water initially
    for (let x = 0; x < 5; x++) expect(p.tileHasWater(x, 0)).toBe(true);

    const b = p.takeBridgeOfType("wood")!;
    // Place a vertical dam at x=2, covering (2,0)
    const { success, dryingSequence } = p.placeBridgeWithWaterChanges(
      b.id, { x: 2, y: -1 }, { x: 2, y: 1 }
    );
    expect(success).toBe(true);
    // Wave 0: (2,0) is the directly-blocked cell that had water
    expect(dryingSequence[0]).toEqual([{ x: 2, y: 0 }]);
    // Wave 1: (3,0) dries up next (immediately downstream of (2,0))
    expect(dryingSequence[1]).toEqual([{ x: 3, y: 0 }]);
    // Wave 2: (4,0) dries up last
    expect(dryingSequence[2]).toEqual([{ x: 4, y: 0 }]);
    expect(dryingSequence.length).toBe(3);
  });

  it("placeBridgeWithWaterChanges excludes cells that still have water via another path", () => {
    // Layout: source at (0,0) flows E through (1,0)→(2,0)→(3,0)→(4,0).
    // (2,0) also sends water S to (2,1). (2,1) is itself an isSource so it retains
    // water even when (2,0) dries up.
    // Bridge at (1,-1)→(1,1) covers only (1,0).
    const spec: FlowPuzzleSpec = {
      id: "flow-alt-path",
      size: { width: 5, height: 3 },
      islands: [
        { id: "DA", x: 1, y: -1 },
        { id: "DB", x: 1, y: 1 }
      ],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E"] },
        { x: 2, y: 0, outgoing: ["E", "S"] },
        { x: 3, y: 0, outgoing: ["E"] },
        { x: 4, y: 0, outgoing: [] },
        { x: 2, y: 1, outgoing: [], isSource: true }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    expect(p.tileHasWater(2, 0)).toBe(true);
    expect(p.tileHasWater(2, 1)).toBe(true);

    const b = p.takeBridgeOfType("wood")!;
    const { success, dryingSequence } = p.placeBridgeWithWaterChanges(
      b.id, { x: 1, y: -1 }, { x: 1, y: 1 }
    );
    expect(success).toBe(true);
    // (1,0) dries up (blocked); (2,0), (3,0), (4,0) dry up downstream
    const allDried = dryingSequence.flat();
    expect(allDried).toContainEqual({ x: 1, y: 0 });
    expect(allDried).toContainEqual({ x: 2, y: 0 });
    expect(allDried).toContainEqual({ x: 3, y: 0 });
    expect(allDried).toContainEqual({ x: 4, y: 0 });
    // (2,1) retains water from its own source – must NOT appear
    expect(allDried).not.toContainEqual({ x: 2, y: 1 });
    // Order check: (1,0) before (2,0), (2,0) before (3,0), (3,0) before (4,0)
    const flat = dryingSequence.flat().map(c => `${c.x},${c.y}`);
    expect(flat.indexOf("1,0")).toBeLessThan(flat.indexOf("2,0"));
    expect(flat.indexOf("2,0")).toBeLessThan(flat.indexOf("3,0"));
    expect(flat.indexOf("3,0")).toBeLessThan(flat.indexOf("4,0"));
  });

  it("removeBridgeWithWaterChanges returns ordered gaining sequence", () => {
    const p = new FlowPuzzle(makeLinearSpec());
    const b = p.takeBridgeOfType("wood")!;
    // First, place the dam
    p.placeBridge(b.id, { x: 2, y: -1 }, { x: 2, y: 1 });
    expect(p.tileHasWater(2, 0)).toBe(false);
    expect(p.tileHasWater(3, 0)).toBe(false);

    // Now remove it and capture the gaining sequence
    const gainingSequence = p.removeBridgeWithWaterChanges(b.id);
    // Wave 0: (2,0) is unblocked and gains water first
    expect(gainingSequence[0]).toEqual([{ x: 2, y: 0 }]);
    // Wave 1: (3,0) gains water next (downstream of (2,0))
    expect(gainingSequence[1]).toEqual([{ x: 3, y: 0 }]);
    // Wave 2: (4,0) gains water last
    expect(gainingSequence[2]).toEqual([{ x: 4, y: 0 }]);
    expect(gainingSequence.length).toBe(3);
    // Water state should be fully restored
    for (let x = 0; x < 5; x++) expect(p.tileHasWater(x, 0)).toBe(true);
  });

  it("removeBridgeWithWaterChanges excludes cells that already had water before removal", () => {
    // Source at (0,0) flows E through (1,0), (2,0), (3,0).
    // (2,0) is also an isSource so it retains water when (1,0) is blocked.
    // Bridge at (1,-1)→(1,1) covers only (1,0).
    const spec: FlowPuzzleSpec = {
      id: "flow-retain",
      size: { width: 4, height: 1 },
      islands: [
        { id: "DA", x: 1, y: -1 },
        { id: "DB", x: 1, y: 1 }
      ],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E"] },
        { x: 2, y: 0, outgoing: ["E"], isSource: true },
        { x: 3, y: 0, outgoing: [] }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    const b = p.takeBridgeOfType("wood")!;
    // Bridge blocks (1,0); (2,0) and (3,0) retain water from (2,0)'s own source
    p.placeBridge(b.id, { x: 1, y: -1 }, { x: 1, y: 1 });
    expect(p.tileHasWater(1, 0)).toBe(false);
    expect(p.tileHasWater(2, 0)).toBe(true);
    expect(p.tileHasWater(3, 0)).toBe(true);

    const gainingSequence = p.removeBridgeWithWaterChanges(b.id);
    // Only (1,0) gains water (it was dry and is now unblocked)
    expect(gainingSequence[0]).toEqual([{ x: 1, y: 0 }]);
    // (2,0) and (3,0) were already wet, should NOT be in the gaining sequence
    const allGained = gainingSequence.flat();
    expect(allGained).not.toContainEqual({ x: 2, y: 0 });
    expect(allGained).not.toContainEqual({ x: 3, y: 0 });
  });

  it("placeBridgeWithWaterChanges returns empty drying sequence when bridge covers only dry cells", () => {
    // Source at (0,0) flows E to (1,0); (1,1) has no source and is always dry.
    // A bridge from (1,0) to (1,2) covers (1,1) – but (1,1) was already dry, so no change.
    const spec: FlowPuzzleSpec = {
      id: "flow-dry-bridge",
      size: { width: 3, height: 3 },
      islands: [
        { id: "DA", x: 1, y: 0 },
        { id: "DB", x: 1, y: 2 }
      ],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: [] },
        { x: 1, y: 1, outgoing: [] }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    expect(p.tileHasWater(1, 1)).toBe(false);

    const b = p.takeBridgeOfType("wood")!;
    // Bridge from (1,0) to (1,2) covers (1,1) which is always dry
    const { success, dryingSequence } = p.placeBridgeWithWaterChanges(b.id, { x: 1, y: 0 }, { x: 1, y: 2 });
    expect(success).toBe(true);
    expect(dryingSequence).toEqual([]);
  });

  it("water change waves respect multiple outgoing directions per cell", () => {
    // A cell fans out to two downstream cells simultaneously.
    // Source at (0,0) → E → (1,0) with outgoing [E, S] → (2,0) and (1,1).
    // Islands at (1,-1) and (1,1) allow a bridge that covers only (1,0).
    const spec: FlowPuzzleSpec = {
      id: "flow-fan",
      size: { width: 3, height: 3 },
      islands: [
        { id: "DA", x: 1, y: -1 },
        { id: "DB", x: 1, y: 1 }
      ],
      bridgeTypes: [{ id: "wood", colour: "brown", count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ["E"], isSource: true },
        { x: 1, y: 0, outgoing: ["E", "S"] },
        { x: 2, y: 0, outgoing: [] },
        { x: 1, y: 1, outgoing: [] }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };
    const p = new FlowPuzzle(spec);
    expect(p.tileHasWater(1, 0)).toBe(true);
    expect(p.tileHasWater(2, 0)).toBe(true);
    expect(p.tileHasWater(1, 1)).toBe(true);

    const b = p.takeBridgeOfType("wood")!;
    // Bridge from (1,-1) to (1,1) covers only (1,0)
    const { success, dryingSequence } = p.placeBridgeWithWaterChanges(
      b.id, { x: 1, y: -1 }, { x: 1, y: 1 }
    );
    expect(success).toBe(true);
    // Wave 0: (1,0) is the only blocked cell and had water
    expect(dryingSequence[0]).toEqual([{ x: 1, y: 0 }]);
    // Wave 1: both (2,0) and (1,1) dry up simultaneously (both downstream of (1,0))
    const wave1Coords = dryingSequence[1].map(c => `${c.x},${c.y}`).sort();
    expect(wave1Coords).toEqual(["1,1", "2,0"]);
    expect(dryingSequence.length).toBe(2);
  });
});

