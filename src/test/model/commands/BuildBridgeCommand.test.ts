import { describe, it, expect } from "vitest";
import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { BuildBridgeCommand } from "@model/commands/BuildBridgeCommand";

describe("BuildBridgeCommand", () => {
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

  it("places a bridge and can undo the placement", () => {
    const puzzle = createSimplePuzzle();
    const countsBefore = puzzle.availableCounts();
    expect(countsBefore["type1"]).toBe(1);

    const cmd = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });

    // Execute places a bridge
    cmd.execute();
    const placed = puzzle.placedBridges;
    expect(placed.length).toBe(1);
    expect(placed[0].type.id).toBe("type1");
    expect(placed[0].start).toEqual({ x: 1, y: 1 });
    expect(placed[0].end).toEqual({ x: 3, y: 1 });

    // Inventory should be depleted
    const countsAfterPlace = puzzle.availableCounts();
    expect(countsAfterPlace["type1"]).toBe(0);

    // Undo should remove the bridge and restore inventory
    cmd.undo();
    expect(puzzle.placedBridges.length).toBe(0);
    const countsAfterUndo = puzzle.availableCounts();
    expect(countsAfterUndo["type1"]).toBe(1);
  });

  it("throws when no bridge of the requested type is available", () => {
    const puzzle = createSimplePuzzle();
    // Exhaust the single bridge first
    const cmd1 = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });
    cmd1.execute();

    const cmd2 = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(() => cmd2.execute()).toThrow();
  });
});
