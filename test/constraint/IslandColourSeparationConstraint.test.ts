import { describe, it, expect } from "vitest";
import { IslandColourSeparationConstraint } from '@model/puzzle/constraints/IslandColourSeparationConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("IslandColourSeparationConstraint", () => {
  it("passes when islands of different colours are not connected", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["colour=red"] },
      { id: "B", x: 2, y: 1, constraints: ["colour=red"] },
      { id: "C", x: 3, y: 1, constraints: ["colour=blue"] },
      { id: "D", x: 4, y: 1, constraints: ["colour=blue"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } },
      { id: "b2", start: { x: 3, y: 1 }, end: { x: 4, y: 1 }, type: { id: "t2" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColourSeparationConstraint("red", "blue");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when islands of different colours are connected", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["colour=red"] },
      { id: "B", x: 2, y: 1, constraints: ["colour=blue"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColourSeparationConstraint("red", "blue");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toContain("A");
    expect(result.affectedElements).toContain("B");
    expect(result.message).toContain("must not connect");
    expect(result.glyphMessage).toBe("red island must-not connected blue island");
  });

  it("passes when all islands are of the same colour", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["colour=red"] },
      { id: "B", x: 2, y: 1, constraints: ["colour=red"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColourSeparationConstraint("red", "blue");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});

describe("IslandColourSeparationConstraint.getDisplayItems", () => {
  it("returns 'good' for all matching-colour islands when constraint is satisfied", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["colour=red"] },
      { id: "B", x: 2, y: 1, constraints: ["colour=red"] },
      { id: "C", x: 3, y: 1, constraints: ["colour=blue"] },
      { id: "D", x: 4, y: 1, constraints: [] },
    ];
    const puzzle = makeMockPuzzle({ islands, bridges: [], placedBridges: [] });

    const constraint = new IslandColourSeparationConstraint("red", "blue");
    const items = constraint.getDisplayItems(puzzle as any);

    // D has no colour so is not included; A, B, C all get "good"
    expect(items).toHaveLength(3);
    expect(items).toContainEqual({ elementID: "A", glyphMessage: "good", constraintType: "IslandColourSeparationConstraint" });
    expect(items).toContainEqual({ elementID: "B", glyphMessage: "good", constraintType: "IslandColourSeparationConstraint" });
    expect(items).toContainEqual({ elementID: "C", glyphMessage: "good", constraintType: "IslandColourSeparationConstraint" });
  });

  it("returns violation glyph for islands in a mixed-colour component", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["colour=red"] },
      { id: "B", x: 2, y: 1, constraints: ["colour=blue"] },
    ];
    const bridges = [{ id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }];
    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColourSeparationConstraint("red", "blue");
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toHaveLength(2);
    expect(items).toContainEqual({ elementID: "A", glyphMessage: "red island must-not connected blue island", constraintType: "IslandColourSeparationConstraint" });
    expect(items).toContainEqual({ elementID: "B", glyphMessage: "red island must-not connected blue island", constraintType: "IslandColourSeparationConstraint" });
  });

  it("shows 'good' for unviolated islands and violation glyph for violated ones", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["colour=red"] },
      { id: "B", x: 2, y: 1, constraints: ["colour=blue"] },
      { id: "C", x: 5, y: 1, constraints: ["colour=red"] },
      { id: "D", x: 6, y: 1, constraints: ["colour=blue"] },
    ];
    // B and C are NOT connected; A+B are connected (violation)
    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } },
    ];
    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColourSeparationConstraint("red", "blue");
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items.find(i => i.elementID === "A")?.glyphMessage).toBe("red island must-not connected blue island");
    expect(items.find(i => i.elementID === "B")?.glyphMessage).toBe("red island must-not connected blue island");
    expect(items.find(i => i.elementID === "C")?.glyphMessage).toBe("good");
    expect(items.find(i => i.elementID === "D")?.glyphMessage).toBe("good");
  });
});
