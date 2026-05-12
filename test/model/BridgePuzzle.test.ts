import { describe, expect, it, beforeEach } from "vitest";
import type { Island } from "@model/puzzle/Island";
import type { BridgeTypeSpec, PuzzleSpec } from "@model/puzzle/BridgePuzzle";
import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { StrutBridge } from "@model/puzzle/StrutBridge";
import { BridgeMustCoverIslandConstraint } from "@model/puzzle/constraints/BridgeMustCoverIslandConstraint";

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

  describe("parseBridgesString", () => {
    it("should parse plain lengths into normal bridge type specs", () => {
      const specs = BridgePuzzle.parseBridgesString("3,2,4");
      expect(specs).toHaveLength(3);
      expect(specs.find(s => s.id === "fixed_3")).toMatchObject({ length: 3, count: 1 });
      expect(specs.find(s => s.id === "fixed_2")).toMatchObject({ length: 2, count: 1 });
      expect(specs.find(s => s.id === "fixed_4")).toMatchObject({ length: 4, count: 1 });
    });

    it("should group duplicate lengths into a single spec with the combined count", () => {
      const specs = BridgePuzzle.parseBridgesString("3,3,3");
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({ id: "fixed_3", length: 3, count: 3 });
    });

    it("should parse '+' entries as strut bridge specs with mustCoverIsland:true", () => {
      const specs = BridgePuzzle.parseBridgesString("3+,4+");
      expect(specs).toHaveLength(2);
      expect(specs.find(s => s.id === "strut_3")).toMatchObject({
        length: 3,
        count: 1,
        mustCoverIsland: true,
      });
      expect(specs.find(s => s.id === "strut_4")).toMatchObject({
        length: 4,
        count: 1,
        mustCoverIsland: true,
      });
    });

    it("should group duplicate strut lengths into a single spec", () => {
      const specs = BridgePuzzle.parseBridgesString("3+,3+");
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({ id: "strut_3", length: 3, count: 2, mustCoverIsland: true });
    });

    it("should handle mixed normal and strut bridges", () => {
      const specs = BridgePuzzle.parseBridgesString("3,2,3+,4+");
      const ids = specs.map(s => s.id).sort();
      expect(ids).toEqual(["fixed_2", "fixed_3", "strut_3", "strut_4"]);
      expect(specs.find(s => s.id === "fixed_3")).not.toHaveProperty("mustCoverIsland", true);
      expect(specs.find(s => s.id === "strut_3")).toMatchObject({ mustCoverIsland: true });
    });

    it("should apply the supplied colour to all specs", () => {
      const specs = BridgePuzzle.parseBridgesString("3,4+", "#ff0000");
      for (const spec of specs) {
        expect(spec.colour).toBe("#ff0000");
      }
    });

    it("should use default colour when none is supplied", () => {
      const specs = BridgePuzzle.parseBridgesString("3");
      expect(specs[0].colour).toBe("#8B4513");
    });

    it("should ignore blank segments", () => {
      const specs = BridgePuzzle.parseBridgesString("3, ,2");
      expect(specs).toHaveLength(2);
    });
  });

  describe("StrutBridge construction", () => {
    it("should create StrutBridge instances for bridge types with mustCoverIsland", () => {
      const spec: PuzzleSpec = {
        id: "strut-test",
        size: { width: 10, height: 5 },
        islands: [],
        bridgeTypes: [{ id: "strut_3", length: 3, count: 2, mustCoverIsland: true }],
        constraints: [],
        maxNumBridges: 2,
      };
      const puzzle = new BridgePuzzle(spec);
      const strutBridges = puzzle.bridges.filter(b => b instanceof StrutBridge);
      expect(strutBridges).toHaveLength(2);
    });

    it("should not create StrutBridge instances for normal bridge types", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      const strutBridges = puzzle.bridges.filter(b => b instanceof StrutBridge);
      expect(strutBridges).toHaveLength(0);
    });

    it("should add a BridgeMustCoverIslandConstraint for each StrutBridge", () => {
      const spec: PuzzleSpec = {
        id: "strut-test",
        size: { width: 10, height: 5 },
        islands: [],
        bridgeTypes: [{ id: "strut_3", length: 3, count: 2, mustCoverIsland: true }],
        constraints: [],
        maxNumBridges: 2,
      };
      const puzzle = new BridgePuzzle(spec);
      const strutConstraints = puzzle.constraints.filter(
        c => c instanceof BridgeMustCoverIslandConstraint
      );
      expect(strutConstraints).toHaveLength(2);
    });

    it("should create puzzle with mixed normal and strut bridges from parseBridgesString", () => {
      const bridgeTypes = BridgePuzzle.parseBridgesString("3,2,3+,4+");
      const spec: PuzzleSpec = {
        id: "mixed-test",
        size: { width: 10, height: 10 },
        islands: [],
        bridgeTypes,
        constraints: [],
        maxNumBridges: 2,
      };
      const puzzle = new BridgePuzzle(spec);
      expect(puzzle.bridges).toHaveLength(4);
      const strutBridges = puzzle.bridges.filter(b => b instanceof StrutBridge);
      expect(strutBridges).toHaveLength(2);
      const strutConstraints = puzzle.constraints.filter(
        c => c instanceof BridgeMustCoverIslandConstraint
      );
      expect(strutConstraints).toHaveLength(2);
    });
  });

  describe("givesFeedback", () => {
    it("defaults to true when not specified in spec", () => {
      const puzzle = new BridgePuzzle(puzzleSpec);
      expect(puzzle.givesFeedback).toBe(true);
    });

    it("is true when explicitly set to true in spec", () => {
      const puzzle = new BridgePuzzle({ ...puzzleSpec, givesFeedback: true });
      expect(puzzle.givesFeedback).toBe(true);
    });

    it("is false when set to false in spec", () => {
      const puzzle = new BridgePuzzle({ ...puzzleSpec, givesFeedback: false });
      expect(puzzle.givesFeedback).toBe(false);
    });
  });
});