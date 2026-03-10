import { describe, it, expect } from "vitest";
import { IslandVisibilityConstraint } from '@model/puzzle/constraints/IslandVisibilityConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("IslandVisibilityConstraint", () => {
  it("passes when correct number of islands are visible", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 },
      { id: "C", x: 3, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } },
      { id: "b2", start: { x: 2, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t2" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, width: 5, height: 3 });

    const constraint = new IslandVisibilityConstraint("A", 2);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when wrong number of islands are visible", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, width: 4, height: 3 });

    const constraint = new IslandVisibilityConstraint("A", 2);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.message).toContain("requires 2 visible islands");
    expect(result.message).toContain("but has 1");
  });

  it("stops counting at gaps in bridge paths", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 },
      { id: "C", x: 3, y: 1 },
      { id: "D", x: 4, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } },
      // Gap: no bridge from B to C
      { id: "b2", start: { x: 3, y: 1 }, end: { x: 4, y: 1 }, type: { id: "t2" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, width: 6, height: 3 });

    const constraint = new IslandVisibilityConstraint("A", 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("counts islands in all four directions", () => {
    const islands = [
      { id: "A", x: 2, y: 2 },
      { id: "B", x: 1, y: 2 }, // left
      { id: "C", x: 3, y: 2 }, // right
      { id: "D", x: 2, y: 1 }, // up
      { id: "E", x: 2, y: 3 }  // down
    ];

    const bridges = [
      { id: "b1", start: { x: 2, y: 2 }, end: { x: 1, y: 2 }, type: { id: "t1" } },
      { id: "b2", start: { x: 2, y: 2 }, end: { x: 3, y: 2 }, type: { id: "t2" } },
      { id: "b3", start: { x: 2, y: 2 }, end: { x: 2, y: 1 }, type: { id: "t3" } },
      { id: "b4", start: { x: 2, y: 2 }, end: { x: 2, y: 3 }, type: { id: "t4" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, width: 5, height: 5 });

    const constraint = new IslandVisibilityConstraint("A", 4);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});
