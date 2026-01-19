import { describe, it, expect } from "vitest";
import { IslandMustBeCoveredConstraint } from '@model/puzzle/constraints/IslandMustBeCoveredConstraint';
import { IslandColorSeparationConstraint } from '@model/puzzle/constraints/IslandColorSeparationConstraint';
import { IslandDirectionalBridgeConstraint } from '@model/puzzle/constraints/IslandDirectionalBridgeConstraint';
import { IslandPassingBridgeCountConstraint } from '@model/puzzle/constraints/IslandPassingBridgeCountConstraint';
import { IslandVisibilityConstraint } from '@model/puzzle/constraints/IslandVisibilityConstraint';
import { EnclosedAreaSizeConstraint } from '@model/puzzle/constraints/EnclosedAreaSizeConstraint';
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

describe("IslandColorSeparationConstraint", () => {
  it("passes when islands of different colours are not connected", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["color=red"] },
      { id: "B", x: 2, y: 1, constraints: ["color=red"] },
      { id: "C", x: 3, y: 1, constraints: ["color=blue"] },
      { id: "D", x: 4, y: 1, constraints: ["color=blue"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } },
      { id: "b2", start: { x: 3, y: 1 }, end: { x: 4, y: 1 }, type: { id: "t2" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColorSeparationConstraint("red", "blue");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });

  it("fails when islands of different colours are connected", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["color=red"] },
      { id: "B", x: 2, y: 1, constraints: ["color=blue"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColorSeparationConstraint("red", "blue");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(false);
    expect(result.affectedElements).toContain("A");
    expect(result.affectedElements).toContain("B");
    expect(result.message).toContain("must not connect");
  });

  it("passes when all islands are of the same colour", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["color=red"] },
      { id: "B", x: 2, y: 1, constraints: ["color=red"] }
    ];

    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, type: { id: "t1" } }
    ];

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandColorSeparationConstraint("red", "blue");
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});

describe("IslandDirectionalBridgeConstraint", () => {
  const createIsland = (id: string, x: number, y: number) => ({ id, x, y });
  const createBridge = (id: string, startX: number, startY: number, endX: number, endY: number) => ({
    id,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    type: { id: "t1" }
  });

  describe("double_horizontal", () => {
    it("passes when island has 2 bridges to the left", () => {
      const islands = [
        createIsland("A", 3, 3),
        createIsland("B", 1, 3),
        createIsland("C", 2, 3)
      ];

      const bridges = [
        createBridge("b1", 3, 3, 2, 3),
        createBridge("b2", 3, 3, 1, 3)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "double_horizontal");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(true);
    });

    it("fails when island has only 1 bridge in each horizontal direction", () => {
      const islands = [
        createIsland("A", 2, 2),
        createIsland("B", 1, 2),
        createIsland("C", 3, 2)
      ];

      const bridges = [
        createBridge("b1", 2, 2, 1, 2),
        createBridge("b2", 2, 2, 3, 2)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "double_horizontal");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("horizontal direction");
    });
  });

  describe("no_double_any_direction", () => {
    it("passes when island has no double bridges", () => {
      const islands = [
        createIsland("A", 2, 2),
        createIsland("B", 1, 2),
        createIsland("C", 3, 2),
        createIsland("D", 2, 1)
      ];

      const bridges = [
        createBridge("b1", 2, 2, 1, 2),
        createBridge("b2", 2, 2, 3, 2),
        createBridge("b3", 2, 2, 2, 1)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "no_double_any_direction");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(true);
    });

    it("fails when island has 2 bridges in the same direction", () => {
      const islands = [
        createIsland("A", 3, 3),
        createIsland("B", 1, 3),
        createIsland("C", 2, 3)
      ];

      const bridges = [
        createBridge("b1", 3, 3, 2, 3),
        createBridge("b2", 3, 3, 1, 3)
      ];

      const bridgesFromIsland = (island: any) => bridges.filter(b => 
        (b.start.x === island.x && b.start.y === island.y) || 
        (b.end.x === island.x && b.end.y === island.y)
      );

      const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges, bridgesFromIsland });

      const constraint = new IslandDirectionalBridgeConstraint("A", "no_double_any_direction");
      const result = constraint.check(puzzle as any);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("must NOT have 2 bridges");
    });
  });
});

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
});

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

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

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

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

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

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

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

    const puzzle = makeMockPuzzle({ islands, bridges, placedBridges: bridges });

    const constraint = new IslandVisibilityConstraint("A", 4);
    const result = constraint.check(puzzle as any);

    expect(result.satisfied).toBe(true);
  });
});

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
