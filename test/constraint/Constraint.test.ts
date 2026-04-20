import { describe, it, expect } from "vitest";
import fs from 'fs';
import path from 'path';
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


describe("IslandBridgeCountConstraint.getDisplayItems", () => {
  const bridgesFromIsland = (island: any, bridges: any[]) =>
    bridges.filter(b =>
      (b.start?.x === island.x && b.start?.y === island.y) ||
      (b.end?.x === island.x && b.end?.y === island.y)
    );

  it("returns an empty array when no islands have a num_bridges constraint", () => {
    const puzzle = makeMockPuzzle({
      islands: [
        { id: "A", x: 1, y: 1, constraints: [] },
        { id: "B", x: 3, y: 1, constraints: [] },
      ],
      bridges: [],
      bridgesFromIsland: () => [],
    });

    const constraint = new IslandBridgeCountConstraint();
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([]);
  });

  it("returns 'good' when an island has the correct bridge count", () => {
    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } },
    ];
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=1"] },
      { id: "B", x: 3, y: 1, constraints: [] },
    ];
    const puzzle = makeMockPuzzle({
      islands,
      bridges,
      bridgesFromIsland: (island: any) => bridgesFromIsland(island, bridges),
    });

    const constraint = new IslandBridgeCountConstraint();
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "good", constraintType: "IslandBridgeCountConstraint", requiredCount: 1, conversationVariables: { count: "1" } }]);
  });

  it("returns 'not-enough bridge' when island has too few bridges", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=2"] },
    ];
    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } },
    ];
    const puzzle = makeMockPuzzle({
      islands,
      bridges,
      bridgesFromIsland: (island: any) => bridgesFromIsland(island, bridges),
    });

    const constraint = new IslandBridgeCountConstraint();
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "not-enough bridge", constraintType: "IslandBridgeCountConstraint", requiredCount: 2, conversationVariables: { count: "2" } }]);
  });

  it("returns 'too-many bridge' when island has too many bridges", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=1"] },
    ];
    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } },
      { id: "b2", start: { x: 1, y: 1 }, end: { x: 1, y: 3 }, type: { id: "t1" } },
    ];
    const puzzle = makeMockPuzzle({
      islands,
      bridges,
      bridgesFromIsland: (island: any) => bridgesFromIsland(island, bridges),
    });

    const constraint = new IslandBridgeCountConstraint();
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toEqual([{ elementID: "A", glyphMessage: "too-many bridge", constraintType: "IslandBridgeCountConstraint", requiredCount: 1, conversationVariables: { count: "1" } }]);
  });

  it("returns one item per constrained island with mixed satisfaction", () => {
    const islands = [
      { id: "A", x: 1, y: 1, constraints: ["num_bridges=1"] },
      { id: "B", x: 3, y: 1, constraints: ["num_bridges=2"] },
      { id: "C", x: 5, y: 1, constraints: [] },
    ];
    const bridges = [
      { id: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, type: { id: "t1" } },
    ];
    const puzzle = makeMockPuzzle({
      islands,
      bridges,
      bridgesFromIsland: (island: any) => bridgesFromIsland(island, bridges),
    });

    const constraint = new IslandBridgeCountConstraint();
    const items = constraint.getDisplayItems(puzzle as any);

    expect(items).toHaveLength(2);
    expect(items).toContainEqual({ elementID: "A", glyphMessage: "good", constraintType: "IslandBridgeCountConstraint", requiredCount: 1, conversationVariables: { count: "1" } });
    expect(items).toContainEqual({ elementID: "B", glyphMessage: "not-enough bridge", constraintType: "IslandBridgeCountConstraint", requiredCount: 2, conversationVariables: { count: "2" } });
  });
});

interface ConversationJSON {
  start: string;
  nodes: Record<string, {
    npc: { expression: string; glyphs?: string };
    choices?: Array<{ text: string; end?: boolean; next?: string }>;
  }>;
}

describe("IslandBridgeCountConstraint conversation files", () => {
  const conversationsDir = path.join(process.cwd(), 'resources/conversations');

  it("satisfied conversation file has a happy expression", () => {
    const constraint = new IslandBridgeCountConstraint();
    const filePath = path.join(conversationsDir, constraint.conversationFileSolved!);
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ConversationJSON;

    const startNode = json.nodes[json.start];
    expect(startNode.npc.expression).toBe("happy");
  });

  it("unsatisfied conversation file has a neutral expression", () => {
    const constraint = new IslandBridgeCountConstraint();
    const filePath = path.join(conversationsDir, constraint.conversationFile!);
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ConversationJSON;

    const startNode = json.nodes[json.start];
    expect(startNode.npc.expression).toBe("neutral");
  });
});
