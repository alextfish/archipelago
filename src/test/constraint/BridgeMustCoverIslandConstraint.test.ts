import { describe, it, expect } from "vitest";
import { BridgeMustCoverIslandConstraint } from '@model/puzzle/constraints/BridgeMustCoverIslandConstraint';
import { makeMockPuzzle } from "../helpers/MockFactories";

describe("BridgeMustCoverIslandConstraint", () => {
  it("passes when bridge with mustCoverIsland covers an island", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 2, y: 1 },
      { id: "C", x: 3, y: 1 }
    ];

    const bridges = [
      { 
        id: "b1", 
        start: { x: 1, y: 1 }, 
        end: { x: 3, y: 1 }, 
        type: { id: "t1", mustCoverIsland: true } 
      }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new BridgeMustCoverIslandConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when bridge with mustCoverIsland does not cover an island", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 3, y: 1 }
    ];

    const bridges = [
      { 
        id: "b1", 
        start: { x: 1, y: 1 }, 
        end: { x: 3, y: 1 }, 
        type: { id: "t1", mustCoverIsland: true } 
      }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new BridgeMustCoverIslandConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toContain("b1");
    expect(result.message).toContain("must cover islands");
  });

  it("passes when bridge without mustCoverIsland does not cover an island", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 3, y: 1 }
    ];

    const bridges = [
      { 
        id: "b1", 
        start: { x: 1, y: 1 }, 
        end: { x: 3, y: 1 }, 
        type: { id: "t1", mustCoverIsland: false } 
      }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new BridgeMustCoverIslandConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("passes when vertical bridge with mustCoverIsland covers an island", () => {
    const islands = [
      { id: "A", x: 1, y: 1 },
      { id: "B", x: 1, y: 2 },
      { id: "C", x: 1, y: 3 }
    ];

    const bridges = [
      { 
        id: "b1", 
        start: { x: 1, y: 1 }, 
        end: { x: 1, y: 3 }, 
        type: { id: "t1", mustCoverIsland: true } 
      }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new BridgeMustCoverIslandConstraint();
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});
