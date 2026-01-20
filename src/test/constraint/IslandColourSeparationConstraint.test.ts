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
