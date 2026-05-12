import { describe, it, expect } from "vitest";
import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { UndoRedoManager } from "@model/UndoRedoManager";
import { BuildBridgeCommand } from "@model/commands/BuildBridgeCommand";

describe("UndoRedoManager", () => {
  function createSimplePuzzle() {
    const spec = {
      id: "test-puzzle",
      size: { width: 4, height: 4 },
      islands: [
        { id: "i1", x: 1, y: 1 },
        { id: "i2", x: 3, y: 1 }
      ],
      bridgeTypes: [{ id: "type1", colour: "black", count: 2 }],
      constraints: []
    } as const;
    return new BridgePuzzle(spec as any);
  }

  it("executes commands and supports undo/redo", () => {
    const puzzle = createSimplePuzzle();
    const manager = new UndoRedoManager();

    const cmd1 = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });
    const cmd2 = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });

    manager.executeCommand(cmd1);
    expect(puzzle.placedBridges.length).toBe(1);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);

    manager.executeCommand(cmd2);
    expect(puzzle.placedBridges.length).toBe(2);

    // Undo twice
    expect(manager.undo()).toBe(true);
    expect(puzzle.placedBridges.length).toBe(1);
    expect(manager.canRedo()).toBe(true);

    expect(manager.undo()).toBe(true);
    expect(puzzle.placedBridges.length).toBe(0);
    expect(manager.canUndo()).toBe(false);

    // Redo twice
    expect(manager.redo()).toBe(true);
    expect(puzzle.placedBridges.length).toBe(1);
    expect(manager.redo()).toBe(true);
    expect(puzzle.placedBridges.length).toBe(2);
  });

  it("enforces max history size", () => {
    const puzzle = createSimplePuzzle();
    const manager = new UndoRedoManager(1); // only keep last

    const cmd1 = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });
    const cmd2 = new BuildBridgeCommand(puzzle, "type1", { x: 1, y: 1 }, { x: 3, y: 1 });

    manager.executeCommand(cmd1);
    manager.executeCommand(cmd2);

    // Only one command should be held in history
    expect(manager.getHistorySize()).toBe(1);
  });
});
