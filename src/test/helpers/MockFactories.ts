import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import type { PuzzleSpec } from "@model/puzzle/BridgePuzzle";

export const makeMockPuzzle = (
    overrides: Partial<BridgePuzzle> = {}
): BridgePuzzle => ({
    id: "mock",
    width: 2,
    height: 2,
    islands: [],
    bridges: [],
    bridgesFromIsland: () => [],
    allBridgesPlaced: () => true,
    ...overrides
});

export const makeMockPuzzleSpec = (
  overrides: Partial<PuzzleSpec> = {}
) : PuzzleSpec => ({
    id: "mock-spec",
    size: { width: 2, height: 2 },
        islands: [],
        bridgeTypes: [],
        constraints: [],
    ...overrides
});