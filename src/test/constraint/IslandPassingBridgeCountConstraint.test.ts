import { describe, it, expect } from "vitest";
import { IslandPassingBridgeCountConstraint } from '@model/puzzle/constraints/IslandPassingBridgeCountConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("IslandPassingBridgeCountConstraint", () => {
  it("passes when correct number of bridges pass above the island", () => {
    const islands = [
      { id: "A", x: 2, y: 3 },
      { id: "B", x: 1, y: 2 },
      { id: "C", x: 3, y: 2 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandPassingBridgeCountConstraint("A", "above", 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when wrong number of bridges pass above the island", () => {
    const islands = [
      { id: "A", x: 2, y: 3 }
    ];

    const bridges: any[] = [];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandPassingBridgeCountConstraint("A", "above", 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.message).toContain("requires 1 bridges passing above");
  });

  it("ignores bridges connected to the island", () => {
    const islands = [
      { id: "A", x: 2, y: 2 },
      { id: "B", x: 1, y: 2 },
      { id: "C", x: 3, y: 2 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandPassingBridgeCountConstraint("A", "above", 0);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("counts vertical bridges passing to the left", () => {
    const islands = [
      { id: "A", x: 3, y: 2 },
      { id: "B", x: 2, y: 1 },
      { id: "C", x: 2, y: 3 }
    ];

    const bridges = [
      { id: "b1", start: { x: 2, y: 1 }, end: { x: 2, y: 3 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandPassingBridgeCountConstraint("A", "left", 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("counts bridges at any distance above the island", () => {
    const islands = [
      { id: "A", x: 2, y: 5 },
      { id: "B", x: 1, y: 2 },
      { id: "C", x: 3, y: 2 },
      { id: "D", x: 1, y: 1 },
      { id: "E", x: 3, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: { id: "t1" } }, // 3 cells above
      { id: "b2", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t2" } }  // 4 cells above
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, width: 5, height: 7 });

    const constraint = new IslandPassingBridgeCountConstraint("A", "above", 2);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("uses 'adjacent' to count only directly adjacent bridges", () => {
    const islands = [
      { id: "A", x: 2, y: 3 },
      { id: "B", x: 1, y: 2 },
      { id: "C", x: 3, y: 2 },
      { id: "D", x: 1, y: 1 },
      { id: "E", x: 3, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: { id: "t1" } }, // Adjacent (1 cell above)
      { id: "b2", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t2" } }  // Not adjacent (2 cells above)
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, width: 5, height: 5 });

    const constraint = new IslandPassingBridgeCountConstraint("A", "adjacent", 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});
