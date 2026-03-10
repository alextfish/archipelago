import { describe, it, expect } from "vitest";
import { IslandBridgeCountConstraint } from '@model/puzzle/constraints/IslandBridgeCountConstraint';
import { AllBridgesPlacedConstraint } from '@model/puzzle/constraints/AllBridgesPlacedConstraint';
import { NoCrossingConstraint } from "@model/puzzle/constraints/NoCrossingConstraint";
import { makeMockPuzzle } from "../helpers/MockFactories";
import { createBridgeType } from "@model/puzzle/BridgeType";



describe("AllBridgesPlacedConstraint", () => {
  const mockType = createBridgeType({ id: "mock" });

  it("passes when all bridges have both endpoints", () => {
    const puzzle = makeMockPuzzle({
      bridges: [
        { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 2 }, type: mockType },
        { id: "b2", start: { x: 3, y: 3 }, end: { x: 4, y: 4 }, type: mockType }
      ]
    });

    const c = new AllBridgesPlacedConstraint();
    const result = c.check(puzzle);
    expect(result.satisfied).toBe(true);
    expect(result.affectedElements).toEqual([]);
  });

  it("fails and lists unplaced bridges", () => {
    const puzzle = makeMockPuzzle({
      bridges: [
        { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 2 }, type: mockType },
        { id: "b2", start: { x: 3, y: 3 }, type: mockType } // missing end
      ]
    });

    const c = new AllBridgesPlacedConstraint();
    const result = c.check(puzzle);
    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toEqual(["b2"]);
    expect(result.message).toContain("b2");
    expect(c.violations?.length).toBe(1);
  });
});

describe("IslandBridgeCountConstraint", () => {
  it("passes when each island has correct bridge count", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=1"] },
      { id: "B", x: 2, y: 2, constraints: ["num_bridges=1"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 2 }, type: { id: "t1" } }
    ];    
    const bridgesFromIsland = (island: any) => bridges.filter(b => (b.start.x === island.x && b.start.y === island.y) || (b.end.x === island.x && b.end.y === island.y));
    const puzzle = makeMockPuzzle({ islands, bridges, bridgesFromIsland });

    // Use a lightweight mock puzzle so we can assign bridges directly
    const constraint = new IslandBridgeCountConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
    expect(result.affectedElements).toEqual([]);
  });

  it("fails when an island has the wrong number of bridges", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=2"] },
      { id: "B", x: 2, y: 2, constraints: ["num_bridges=1"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 2 }, type: { id: "t1" } }
    ];
    
    const bridgesFromIsland = (island: any) => bridges.filter(b => (b.start.x === island.x && b.start.y === island.y) || (b.end.x === island.x && b.end.y === island.y));
    const puzzle = makeMockPuzzle({ islands, bridges, bridgesFromIsland });
    const constraint = new IslandBridgeCountConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toEqual(["A"]);
    expect(result.message).toContain("A");
    expect(result.glyphMessage).toBe("not-enough bridge");
  });

  it("returns 'too-many bridge' glyph message when island has too many bridges", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=1"] },
      { id: "B", x: 2, y: 2, constraints: [] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 2 }, type: { id: "t1" } },
      { id: "b2", start: { x: 1, y: 1 }, end: { x: 3, y: 3 }, type: { id: "t2" } }
    ];
    
    const bridgesFromIsland = (island: any) => bridges.filter(b => (b.start.x === island.x && b.start.y === island.y) || (b.end.x === island.x && b.end.y === island.y));
    const puzzle = makeMockPuzzle({ islands, bridges, bridgesFromIsland });
    const constraint = new IslandBridgeCountConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.glyphMessage).toBe("too-many bridge");
  });
});


describe("NoCrossingConstraint", () => {
  it("passes when no bridges cross", () => {
    const puzzle = makeMockPuzzle({
        bridges: [
  { id: "b1", start: { x: 0, y: 0 }, end: { x: 0, y: 5 }, type: { id: "t1", length: -1, colour: "black", width: 1, style: "normal" } },
  { id: "b2", start: { x: 2, y: 0 }, end: { x: 2, y: 5 }, type: { id: "t2", length: -1, colour: "black", width: 1, style: "normal" } }
      ]
    });

    const constraint = new NoCrossingConstraint();
    const result = constraint.check(puzzle);

    expect(result.satisfied).toBe(true);
    expect(result.affectedElements).toEqual([]);
  });

  it("fails when bridges cross", () => {
    const puzzle = makeMockPuzzle({
        bridges: [
  { id: "b1", start: { x: 0, y: 0 }, end: { x: 4, y: 4 }, type: { id: "t1", length: -1, colour: "black", width: 1, style: "normal" } },
  { id: "b2", start: { x: 0, y: 4 }, end: { x: 4, y: 0 }, type: { id: "t2", length: -1, colour: "black", width: 1, style: "normal" } }
      ]
    });

    const constraint = new NoCrossingConstraint();
    const result = constraint.check(puzzle);

    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toContain("b1:b2");
    expect(result.message).toContain("Crossing");
  });

  it("ignores shared endpoints", () => {
    const puzzle = makeMockPuzzle({
        bridges: [
  { id: "b1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, type: { id: "t1", length: -1, colour: "black", width: 1, style: "normal" } },
  { id: "b2", start: { x: 4, y: 0 }, end: { x: 4, y: 4 }, type: { id: "t2", length: -1, colour: "black", width: 1, style: "normal" } }
      ]
    });

    const constraint = new NoCrossingConstraint();
    const result = constraint.check(puzzle);

    expect(result.satisfied).toBe(true);
  });
});
