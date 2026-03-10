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
