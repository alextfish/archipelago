import { describe, it, expect } from "vitest";
import { BridgeMustCoverIslandConstraint } from '@model/puzzle/constraints/BridgeMustCoverIslandConstraint';
import { StrutBridge } from '@model/puzzle/StrutBridge';
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
    expect(result.message).toContain("must cover island");
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

  describe("per-bridge mode (with bridgeID)", () => {
    it("only checks the specified bridge", () => {
      const islands = [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 4, y: 0 },
      ];

      // b1 does NOT cover an island; b2 DOES
      const bridges = [
        { id: "b1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, type: { id: "t1", mustCoverIsland: true } },
        { id: "b2", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, type: { id: "t2", mustCoverIsland: true } },
      ];

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

      // Constraint for b1 should fail
      const c1 = new BridgeMustCoverIslandConstraint("b1");
      expect(c1.check(puzzle as any).satisfied).toBe(false);

      // Constraint for b2 (same setup) also fails since there's no crossed island
      const c2 = new BridgeMustCoverIslandConstraint("b2");
      expect(c2.check(puzzle as any).satisfied).toBe(false);
    });

    it("getDisplayItems returns empty array for unplaced bridge", () => {
      const bridge = new StrutBridge("b1", { id: "strut_3", mustCoverIsland: true });
      // Not placed (no start/end)
      const puzzle = makeMockPuzzle({ islands: [], bridges: [bridge], placedBridges: [] });

      const constraint = new BridgeMustCoverIslandConstraint("b1");
      const items = constraint.getDisplayItems(puzzle as any);
      expect(items).toHaveLength(0);
    });

    it("getDisplayItems returns item with strut location for placed StrutBridge", () => {
      const islands = [
        { id: "A", x: 0, y: 0 },
        { id: "mid", x: 2, y: 0 },
        { id: "B", x: 4, y: 0 },
      ];

      const bridge = new StrutBridge("b1", { id: "strut_4", mustCoverIsland: true });
      bridge.start = { x: 0, y: 0 };
      bridge.end = { x: 4, y: 0 };

      const puzzle = makeMockPuzzle({
        islands,
        bridges: [bridge],
        placedBridges: [bridge],
      });

      const constraint = new BridgeMustCoverIslandConstraint("b1");
      const items = constraint.getDisplayItems(puzzle as any);

      expect(items).toHaveLength(1);
      expect(items[0].elementID).toBe("b1");
      expect(items[0].constraintType).toBe("BridgeMustCoverIslandConstraint");
      // Strut is at the crossed island (x:2, y:0)
      expect(items[0].position).toEqual({ x: 2, y: 0 });
    });

    it("getDisplayItems returns 'good' glyphMessage when bridge covers an island", () => {
      const islands = [
        { id: "A", x: 0, y: 0 },
        { id: "mid", x: 2, y: 0 },
        { id: "B", x: 4, y: 0 },
      ];

      const bridge = new StrutBridge("b1", { id: "strut_4", mustCoverIsland: true });
      bridge.start = { x: 0, y: 0 };
      bridge.end = { x: 4, y: 0 };

      const puzzle = makeMockPuzzle({ islands, bridges: [bridge], placedBridges: [bridge] });
      const constraint = new BridgeMustCoverIslandConstraint("b1");
      const items = constraint.getDisplayItems(puzzle as any);

      expect(items[0].glyphMessage).toBe("good");
    });

    it("getDisplayItems returns 'no island under bridge' when bridge does not cover an island", () => {
      const islands = [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 4, y: 0 },
      ];

      const bridge = new StrutBridge("b1", { id: "strut_4", mustCoverIsland: true });
      bridge.start = { x: 0, y: 0 };
      bridge.end = { x: 4, y: 0 };

      const puzzle = makeMockPuzzle({ islands, bridges: [bridge], placedBridges: [bridge] });
      const constraint = new BridgeMustCoverIslandConstraint("b1");
      const items = constraint.getDisplayItems(puzzle as any);

      expect(items).toHaveLength(1);
      expect(items[0].glyphMessage).toBe("no island under bridge");
      // No crossed island → position is midpoint (2,0)
      expect(items[0].position).toEqual({ x: 2, y: 0 });
    });

    it("getDisplayItems returns empty array for a non-StrutBridge", () => {
      const bridge = {
        id: "b1",
        start: { x: 0, y: 0 },
        end: { x: 4, y: 0 },
        type: { id: "t1", mustCoverIsland: true },
      };
      const puzzle = makeMockPuzzle({ islands: [], bridges: [bridge as any], placedBridges: [bridge as any] });
      const constraint = new BridgeMustCoverIslandConstraint("b1");
      const items = constraint.getDisplayItems(puzzle as any);
      expect(items).toHaveLength(0);
    });
  });
});
