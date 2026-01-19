import { describe, it, expect } from "vitest";
import { IslandMustBeCoveredConstraint } from '@model/puzzle/constraints/IslandMustBeCoveredConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("IslandMustBeCoveredConstraint", () => {
  it("passes when island is covered by a horizontal bridge", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 },
      { id: "C", x: 3, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandMustBeCoveredConstraint("B");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
    expect(result.affectedElements).toContain("b1");
  });

  it("passes when island is covered by a vertical bridge", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 1, y: 2 },
      { id: "C", x: 1, y: 3 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 1, y: 3 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandMustBeCoveredConstraint("B");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when island is not covered by any bridge", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 },
      { id: "C", x: 3, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandMustBeCoveredConstraint("B");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toContain("B");
    expect(result.message).toContain("must be covered");
  });

  it("fails when bridge endpoints are at the island (not covering it)", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandMustBeCoveredConstraint("A");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
  });
});
