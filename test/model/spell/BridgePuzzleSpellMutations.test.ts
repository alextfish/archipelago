import { describe, it, expect } from 'vitest';
import { BridgePuzzle, type PuzzleSpec } from '@model/puzzle/BridgePuzzle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides: Partial<PuzzleSpec> = {}): PuzzleSpec {
    return {
        id: 'test-puzzle',
        size: { width: 10, height: 10 },
        islands: [
            { id: 'A', x: 0, y: 0 },
            { id: 'B', x: 4, y: 0 },
        ],
        bridgeTypes: [{ id: 'normal', count: 2, length: 4 }],
        constraints: [],
        maxNumBridges: 2,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// addRuntimeIsland
// ---------------------------------------------------------------------------

describe('BridgePuzzle.addRuntimeIsland', () => {
    it('adds a new island to the puzzle', () => {
        const puzzle = new BridgePuzzle(makeSpec());
        expect(puzzle.islands).toHaveLength(2);

        puzzle.addRuntimeIsland({ id: 'C', x: 2, y: 2 });

        expect(puzzle.islands).toHaveLength(3);
        expect(puzzle.islands.find(i => i.id === 'C')).toBeDefined();
    });

    it('is idempotent: adding the same island twice does not duplicate it', () => {
        const puzzle = new BridgePuzzle(makeSpec());
        puzzle.addRuntimeIsland({ id: 'C', x: 2, y: 2 });
        puzzle.addRuntimeIsland({ id: 'C', x: 2, y: 2 });

        expect(puzzle.islands.filter(i => i.id === 'C')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// addRuntimeBridge
// ---------------------------------------------------------------------------

describe('BridgePuzzle.addRuntimeBridge', () => {
    it('adds a bridge already placed in the puzzle', () => {
        const puzzle = new BridgePuzzle(makeSpec());
        const initialBridgeCount = puzzle.bridges.length;

        puzzle.addRuntimeBridge({ x: 0, y: 0 }, { x: 4, y: 0 }, { id: 'spell_bridge', count: 1 });

        expect(puzzle.bridges).toHaveLength(initialBridgeCount + 1);
    });

    it('the added bridge appears placed at the specified start/end', () => {
        const puzzle = new BridgePuzzle(makeSpec());

        const bridge = puzzle.addRuntimeBridge(
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { id: 'spell_bridge', count: 1 },
        );

        expect(bridge.start).toEqual({ x: 0, y: 0 });
        expect(bridge.end).toEqual({ x: 4, y: 0 });
        expect(puzzle.placedBridges.some(b => b.id === bridge.id)).toBe(true);
    });

    it('is idempotent: calling again with the same spec does not add a second bridge', () => {
        const puzzle = new BridgePuzzle(makeSpec());
        const initialCount = puzzle.bridges.length;

        puzzle.addRuntimeBridge({ x: 0, y: 0 }, { x: 4, y: 0 }, { id: 'spell_bridge', count: 1 });
        puzzle.addRuntimeBridge({ x: 0, y: 0 }, { x: 4, y: 0 }, { id: 'spell_bridge', count: 1 });

        expect(puzzle.bridges).toHaveLength(initialCount + 1);
    });

    it('the runtime bridge participates in placedBridges and is affected by puzzle logic', () => {
        const puzzle = new BridgePuzzle(makeSpec({
            islands: [
                { id: 'A', x: 0, y: 0 },
                { id: 'B', x: 4, y: 0 },
                { id: 'C', x: 0, y: 4 },
            ],
        }));

        puzzle.addRuntimeBridge({ x: 0, y: 0 }, { x: 4, y: 0 }, { id: 'spell_bridge', count: 1 });

        // The bridge should appear in bridgesFromIsland
        const islandA = puzzle.islands.find(i => i.id === 'A')!;
        const bridgesFromA = puzzle.bridgesFromIsland(islandA);
        expect(bridgesFromA).toHaveLength(1);
        expect(bridgesFromA[0].id).toBe('runtime_spell_bridge');
    });
});

// ---------------------------------------------------------------------------
// markTilesOpened
// ---------------------------------------------------------------------------

describe('BridgePuzzle.markTilesOpened', () => {
    it('makes previously blocked tiles passable', () => {
        const puzzle = new BridgePuzzle(makeSpec({
            blockedTiles: [{ x: 2, y: 0 }],
        }));

        // Before opening: bridge from (0,0) to (4,0) passes through blocked tile (2,0)
        expect(puzzle.bridgePassesThroughBlockedTile({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);

        puzzle.markTilesOpened([{ x: 2, y: 0 }]);

        // After opening: tile is no longer blocked
        expect(puzzle.bridgePassesThroughBlockedTile({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
        expect(puzzle.isBlockedTile(2, 0)).toBe(false);
    });

    it('is idempotent: opening the same tile twice does not throw', () => {
        const puzzle = new BridgePuzzle(makeSpec({
            blockedTiles: [{ x: 2, y: 0 }],
        }));

        puzzle.markTilesOpened([{ x: 2, y: 0 }]);
        puzzle.markTilesOpened([{ x: 2, y: 0 }]); // second call is a no-op

        expect(puzzle.isBlockedTile(2, 0)).toBe(false);
    });

    it('only removes the specified tiles, leaving others blocked', () => {
        const puzzle = new BridgePuzzle(makeSpec({
            blockedTiles: [{ x: 2, y: 0 }, { x: 3, y: 0 }],
        }));

        puzzle.markTilesOpened([{ x: 2, y: 0 }]);

        expect(puzzle.isBlockedTile(2, 0)).toBe(false);
        expect(puzzle.isBlockedTile(3, 0)).toBe(true);
    });

    it('silently ignores tiles not in the blocked set', () => {
        const puzzle = new BridgePuzzle(makeSpec());

        // No blocked tiles — should not throw
        expect(() => puzzle.markTilesOpened([{ x: 5, y: 5 }])).not.toThrow();
    });
});
