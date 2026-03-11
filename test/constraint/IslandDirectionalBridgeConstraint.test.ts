import { describe, it, expect } from "vitest";
import { IslandDirectionalBridgeConstraint } from '@model/puzzle/constraints/IslandDirectionalBridgeConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("IslandDirectionalBridgeConstraint", () => {
  const createIsland = (id: string, x: number, y: number) => ({ id, x, y });
  const createBridge = (id: string, startX: number, startY: number, endX: number, endY: number) => ({
    id,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    type: { id: "t1" }
  });

  describe("double_horizontal", () => {
    it("passes when island has 2 bridges to the left", () => {
      const islands = [
        createIsland("A", 3, 3),
        createIsland("B", 1, 3),
        createIsland("C", 2, 3)
      ];

      const bridges = [
        createBridge("b1", 3, 3, 2, 3),
        createBridge("b2", 3, 3, 1, 3)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "double_horizontal");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(true);
    });

    it("passes when island has 1 bridge in each horizontal direction", () => {
      const islands = [
        createIsland("A", 2, 2),
        createIsland("B", 1, 2),
        createIsland("C", 3, 2)
      ];

      const bridges = [
        createBridge("b1", 2, 2, 1, 2),
        createBridge("b2", 2, 2, 3, 2)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "double_horizontal");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(true); // Now passes because one left + one right is allowed
    });
  });

  describe("no_double_any_direction", () => {
    it("passes when island has no double bridges", () => {
      const islands = [
        createIsland("A", 2, 2),
        createIsland("B", 1, 2),
        createIsland("C", 3, 2),
        createIsland("D", 2, 1)
      ];

      const bridges = [
        createBridge("b1", 2, 2, 1, 2),
        createBridge("b2", 2, 2, 3, 2),
        createBridge("b3", 2, 2, 2, 1)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "no_double_any_direction");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(true);
    });

    it("fails when island has 2 bridges in the same direction", () => {
      const islands = [
        createIsland("A", 3, 3),
        createIsland("B", 1, 3),
        createIsland("C", 2, 3)
      ];

      const bridges = [
        createBridge("b1", 3, 3, 2, 3),
        createBridge("b2", 3, 3, 1, 3)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "no_double_any_direction");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("must NOT have 2 bridges");
    });
  });
});

describe("IslandDirectionalBridgeConstraint.getDisplayItems", () => {
  const createBridge = (id: string, sx: number, sy: number, ex: number, ey: number) => ({
    id, start: { x: sx, y: sy }, end: { x: ex, y: ey }, type: { id: "t1" },
  });

  it("returns 'good' when double_horizontal is satisfied", () => {
    const islands = [{ id: "A", x: 2, y: 2 }, { id: "B", x: 1, y: 2 }, { id: "C", x: 3, y: 2 }];
    const bridges = [createBridge("b1", 2, 2, 1, 2), createBridge("b2", 2, 2, 3, 2)];
    const bridgesFromIsland = (island: any) => bridges.filter(b =>
      (b.start.x === island.x && b.start.y === island.y) || (b.end.x === island.x && b.end.y === island.y)
    );
    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });
    const constraint = new IslandDirectionalBridgeConstraint("A", "double_horizontal");

    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "good" }]);
  });

  it("returns 'not-enough horizontal bridge' when double_horizontal is violated", () => {
    const islands = [{ id: "A", x: 2, y: 2 }];
    const bridges: any[] = [];
    const bridgesFromIsland = () => [];
    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });
    const constraint = new IslandDirectionalBridgeConstraint("A", "double_horizontal");

    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "not-enough horizontal bridge" }]);
  });

  it("returns 'not-enough vertical bridge' when double_vertical is violated", () => {
    const islands = [{ id: "A", x: 2, y: 2 }];
    const puzzle = makeMockPuzzle({ islands, bridges: [], placedBridges: [], bridgesFromIsland: () => [] });
    const constraint = new IslandDirectionalBridgeConstraint("A", "double_vertical");

    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "not-enough vertical bridge" }]);
  });

  it("returns 'not-enough bridge' when double_any_direction is violated", () => {
    const islands = [{ id: "A", x: 2, y: 2 }];
    const puzzle = makeMockPuzzle({ islands, bridges: [], placedBridges: [], bridgesFromIsland: () => [] });
    const constraint = new IslandDirectionalBridgeConstraint("A", "double_any_direction");

    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "not-enough bridge" }]);
  });

  it("returns 'too-many bridge' when no_double_any_direction is violated", () => {
    // Island A at (3,2) has 2 bridges going left → counts.left = 2 → violation
    const islands = [{ id: "A", x: 3, y: 2 }, { id: "B", x: 1, y: 2 }, { id: "C", x: 2, y: 2 }];
    const bridges = [createBridge("b1", 3, 2, 2, 2), createBridge("b2", 3, 2, 1, 2)];
    const bridgesFromIsland = (island: any) => bridges.filter(b =>
      (b.start.x === island.x && b.start.y === island.y) || (b.end.x === island.x && b.end.y === island.y)
    );
    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });
    const constraint = new IslandDirectionalBridgeConstraint("A", "no_double_any_direction");

    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "too-many bridge" }]);
  });
});
