import { describe, it, expect } from "vitest";
import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { RemoveBridgeCommand } from "@model/commands/RemoveBridgeCommand";

describe("RemoveBridgeCommand", () => {
  function createSimplePuzzle() {
    const spec = {
      id: "test-puzzle",
      size: { width: 4, height: 4 },
      islands: [
        { id: "i1", x: 1, y: 1 },
        { id: "i2", x: 3, y: 1 }
      ],
      bridgeTypes: [{ id: "type1", colour: "black", count: 1 }],
      constraints: []
    } as const;
    return new BridgePuzzle(spec as any);
  }

  it("removes a placed bridge and can undo the removal", () => {
    const puzzle = createSimplePuzzle();

    // Allocate and place a bridge manually
    const bridge = puzzle.takeBridgeOfType("type1");
    expect(bridge).toBeDefined();
    const bId = bridge!.id;
    const start = { x: 1, y: 1 };
    const end = { x: 3, y: 1 };
    const placed = puzzle.placeBridge(bId, start, end);
    expect(placed).toBe(true);
    expect(puzzle.placedBridges.length).toBe(1);
    expect(puzzle.availableCounts()["type1"]).toBe(0);

    const cmd = new RemoveBridgeCommand(puzzle, bId);
    cmd.execute();

    // After removal there should be no placed bridges and the inventory restored
    expect(puzzle.placedBridges.length).toBe(0);
    expect(puzzle.availableCounts()["type1"]).toBe(1);

    // Undo should restore the same bridge placement
    cmd.undo();
    expect(puzzle.placedBridges.length).toBe(1);
    const restored = puzzle.placedBridges[0];
    expect(restored.id).toBe(bId);
    expect(restored.start).toEqual(start);
    expect(restored.end).toEqual(end);
  });

  it("throws if given an invalid bridge id", () => {
    const puzzle = createSimplePuzzle();
    const cmd = new RemoveBridgeCommand(puzzle, "nonexistent");
    expect(() => cmd.execute()).toThrow();
  });
});
