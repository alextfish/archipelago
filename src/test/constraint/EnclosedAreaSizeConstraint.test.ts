import { describe, it, expect } from "vitest";
import { EnclosedAreaSizeConstraint } from '@model/puzzle/constraints/EnclosedAreaSizeConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("EnclosedAreaSizeConstraint", () => {
  it("passes when cell is in enclosed area of correct size", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 3, y: 1 },
      { id: "C", x: 5, y: 3 },
      { id: "D", x: 1, y: 3 },
      { id: "E", x: 3, y: 3 },
      { id: "F", x: 5, y: 3 },
      { id: "G", x: 1, y: 5 },
      { id: "H", x: 3, y: 5 },
      { id: "I", x: 5, y: 5 }
    ];

    const bridges = [
      // Top horizontal row
      { id: "h11", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "b2" } },
      { id: "h12", start: { x: 3, y: 1 }, end: { x: 5, y: 1 }, type: { id: "b2" } },
      // Middle horizontal row - h22 removed to create a 3x1 area on the right
      { id: "h21", start: { x: 1, y: 3 }, end: { x: 3, y: 3 }, type: { id: "b2" } },
      // Bottom horizontal row
      { id: "h31", start: { x: 1, y: 5 }, end: { x: 3, y: 5 }, type: { id: "b2" } },
      { id: "h32", start: { x: 3, y: 5 }, end: { x: 5, y: 5 }, type: { id: "b2" } },
      // Left vertical column
      { id: "v11", start: { x: 1, y: 1 }, end: { x: 1, y: 3 }, type: { id: "b2" } },
      { id: "v12", start: { x: 1, y: 3 }, end: { x: 1, y: 5 }, type: { id: "b2" } },
      // Middle vertical column
      { id: "v21", start: { x: 3, y: 1 }, end: { x: 3, y: 3 }, type: { id: "b2" } },
      { id: "v22", start: { x: 3, y: 3 }, end: { x: 3, y: 5 }, type: { id: "b2" } },
      // Right vertical column
      { id: "v31", start: { x: 5, y: 1 }, end: { x: 5, y: 3 }, type: { id: "b2" } },
      { id: "v32", start: { x: 5, y: 3 }, end: { x: 5, y: 5 }, type: { id: "b2" } }
    ];

    const puzzle = makeMockPuzzle({
      islands,
      bridges,
      placedBridges: bridges,
      width: 5,
      height: 5
    });

    // Left side: Two 1×1 enclosed areas
    // The enclosed area at (2,2) should be 1 cell
    const constraint1 = new EnclosedAreaSizeConstraint(2, 2, 1);
    const result1 = constraint1.check(puzzle as any);
    expect(result1.satisfied).toBe(true);

    // The enclosed area at (2,4) should be 1 cell
    const constraint2 = new EnclosedAreaSizeConstraint(2, 4, 1);
    const result2 = constraint2.check(puzzle as any);
    expect(result2.satisfied).toBe(true);

    // Right side: One 3×1 enclosed area (no horizontal bridge at y=3 separating it)
    // All three cells (4,2), (4,3), (4,4) should be in the same enclosed area of size 3
    const constraint3 = new EnclosedAreaSizeConstraint(4, 2, 3);
    const result3 = constraint3.check(puzzle as any);
    expect(result3.satisfied).toBe(true);

    const constraint4 = new EnclosedAreaSizeConstraint(4, 3, 3);
    const result4 = constraint4.check(puzzle as any);
    expect(result4.satisfied).toBe(true);

    const constraint5 = new EnclosedAreaSizeConstraint(4, 4, 3);
    const result5 = constraint5.check(puzzle as any);
    expect(result5.satisfied).toBe(true);
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
