import { describe, it, expect } from "vitest";
import { EnclosedAreaSizeConstraint } from '@model/puzzle/constraints/EnclosedAreaSizeConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("EnclosedAreaSizeConstraint", () => {
  it("passes when cell is in enclosed area of correct size", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 3, y: 1 },
      { id: "C", x: 1, y: 3 },
      { id: "D", x: 3, y: 3 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } },
      { id: "b2", start: { x: 1, y: 3 }, end: { x: 3, y: 3 }, type: { id: "t2" } },
      { id: "b3", start: { x: 1, y: 1 }, end: { x: 1, y: 3 }, type: { id: "t3" } },
      { id: "b4", start: { x: 3, y: 1 }, end: { x: 3, y: 3 }, type: { id: "t4" } }
    ];

    const puzzle = makeMockPuzzle({ 
      islands, 
      bridges, 
      placedBridges: bridges,
      width: 5,
      height: 5
    });

    // The enclosed area should be 1 cell (2,2)
    const constraint = new EnclosedAreaSizeConstraint(2, 2, 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when cell is in enclosed area of wrong size", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 4, y: 1 },
      { id: "C", x: 1, y: 3 },
      { id: "D", x: 4, y: 3 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 4, y: 1 }, type: { id: "t1" } },
      { id: "b2", start: { x: 1, y: 3 }, end: { x: 4, y: 3 }, type: { id: "t2" } },
      { id: "b3", start: { x: 1, y: 1 }, end: { x: 1, y: 3 }, type: { id: "t3" } },
      { id: "b4", start: { x: 4, y: 1 }, end: { x: 4, y: 3 }, type: { id: "t4" } }
    ];

    const puzzle = makeMockPuzzle({ 
      islands, 
      bridges, 
      placedBridges: bridges,
      width: 6,
      height: 5
    });

    // The enclosed area is larger than 1
    const constraint = new EnclosedAreaSizeConstraint(2, 2, 1);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.message).toContain("enclosed area");
  });

  it("passes when size=0 and cell is covered by a bridge", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 3, y: 1 }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ 
      islands, 
      bridges, 
      placedBridges: bridges,
      width: 5,
      height: 5
    });

    const constraint = new EnclosedAreaSizeConstraint(2, 1, 0);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("passes when size=0 and cell is open to outside", () => {
    const islands = [
      { id: "A", x: 2, y: 2 }
    ];

    const bridges: any[] = [];

    const puzzle = makeMockPuzzle({ 
      islands, 
      bridges, 
      placedBridges: bridges,
      width: 5,
      height: 5
    });

    const constraint = new EnclosedAreaSizeConstraint(1, 1, 0);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});
