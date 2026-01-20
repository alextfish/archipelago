import { describe, expect, it, beforeEach } from "vitest";
import type { Island } from "@model/puzzle/Island";
import type { BridgeTypeSpec, PuzzleSpec } from "@model/puzzle/BridgePuzzle";
import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";

describe("BridgePuzzle", () => {
  let mockIslands: Island[];
  let mockBridgeTypes: BridgeTypeSpec[];
  let mockConstraints: { type: string; params?: any }[];
  let puzzleSpec: PuzzleSpec;

  beforeEach(() => {
    mockIslands = [
      {
        id: "island1",
        x: 0,
        y: 0,
        constraints: ["num_bridges=2"]
      },
      {
        id: "island2",
        x: 2,
        y: 0,
        constraints: ["num_bridges=1"]
      }
    ];

    mockBridgeTypes = [
      {
        id: "wood",
        colour: "brown",
        length: 1,
        count: 3
      }
    ];

    mockConstraints = [
      { type: "AllBridgesPlacedConstraint" },
      { type: "NoCrossingConstraint" }
    ];

    puzzleSpec = {
      id: "test-puzzle",
      size: { width: 5, height: 5 },
      islands: mockIslands,
      bridgeTypes: mockBridgeTypes,
      constraints: mockConstraints,
      maxNumBridges: 2
    };
  });

  describe("constructor", () => {
    it("should create a puzzle with correct basic properties", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);

      expect(puzzle.id).toBe("test-puzzle");
      expect(puzzle.width).toBe(5);
      expect(puzzle.height).toBe(5);
      expect(puzzle.islands).toBe(mockIslands);
      expect(puzzle.constraints.length).toBeGreaterThanOrEqual(2); // At least the 2 from spec
      expect(puzzle.inventory).toBeDefined();
    });

    it("should set default maxNumBridges when not specified", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      expect(puzzle.maxNumBridges).toBe(2);
    });

    it("should use specified maxNumBridges", () => {
      const specWithMax = { ...puzzleSpec, maxNumBridges: 50 };
      const puzzle = new BridgePuzzle(specWithMax);
      expect(puzzle.maxNumBridges).toBe(50);
    });
  });

  describe("bridge operations", () => {
    it("should get all bridges from inventory", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      const bridges = puzzle.bridges;

      expect(bridges).toHaveLength(3);
      expect(bridges.every(b => b.type.id === "wood")).toBe(true);
    });

    it("should place and remove bridges", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      const bridgeId = puzzle.bridges[0].id;

      // Place bridge
      const placed = puzzle.placeBridge(bridgeId, { x: 0, y: 0 }, { x: 1, y: 0 });
      expect(placed).toBe(true);
      expect(puzzle.placedBridges).toHaveLength(1);

      // Remove bridge
      puzzle.removeBridge(bridgeId);
      expect(puzzle.placedBridges).toHaveLength(0);
    });

    it("should find bridges at position", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      const bridgeId = puzzle.bridges[0].id;

      puzzle.placeBridge(bridgeId, { x: 0, y: 0 }, { x: 2, y: 0 });
      const bridgesAt1 = puzzle.bridgesAt(1, 0);

      expect(bridgesAt1).toHaveLength(1);
      expect(bridgesAt1[0].id).toBe(bridgeId);
    });
  });

  describe("island operations", () => {
    it("should find bridges from island", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      const island1 = puzzle.islands[0];
      const bridgeId = puzzle.bridges[0].id;

      puzzle.placeBridge(bridgeId, { x: 0, y: 0 }, { x: 1, y: 0 });
      const bridgesFromIsland = puzzle.bridgesFromIsland(island1);

      expect(bridgesFromIsland).toHaveLength(1);
      expect(bridgesFromIsland[0].id).toBe(bridgeId);
    });

    it("should count bridges between islands", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      const bridgeId = puzzle.bridges[0].id;

      puzzle.placeBridge(bridgeId, { x: 0, y: 0 }, { x: 2, y: 0 });
      const count = puzzle.getBridgeCountBetween("island1", "island2");

      expect(count).toBe(1);
    });
  });

  describe("validation", () => {
    it("should check if all bridges are placed", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      expect(puzzle.allBridgesPlaced()).toBe(false);

      // Place all bridges
      puzzle.placeBridge(puzzle.bridges[0].id, { x: 0, y: 0 }, { x: 1, y: 0 });
      puzzle.placeBridge(puzzle.bridges[1].id, { x: 1, y: 0 }, { x: 2, y: 0 });
      puzzle.placeBridge(puzzle.bridges[2].id, { x: 2, y: 0 }, { x: 3, y: 0 });

      expect(puzzle.allBridgesPlaced()).toBe(true);
    });

    it("should validate bridge placement possibilities", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);

      expect(puzzle.couldPlaceBridgeAt("island1", "island2")).toBe(true);
      expect(puzzle.couldPlaceBridgeAt("island1", "nonexistent")).toBe(false);
    });
  });
});