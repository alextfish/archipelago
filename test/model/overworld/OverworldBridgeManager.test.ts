import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import { CollisionType } from '@model/overworld/CollisionTypes';
import type { Bridge } from '@model/puzzle/Bridge';

/**
 * Build a minimal mock bridges layer.  putTileAt returns a truthy object so
 * the tile-placed counter increments; all other methods are no-ops.
 */
function makeBridgesLayer() {
    return {
        layer: {
            width: 20, height: 20,
            data: Array.from({ length: 20 }, () => Array(20).fill(null))
        },
        putTileAt: vi.fn().mockReturnValue({ index: 1 }),
        removeTileAt: vi.fn(),
        visible: true,
    };
}

/**
 * Minimal Tiled map data.  The bridge tileset starts at GID 1 and uses the
 * canonical filename so OverworldBridgeManager can find it.
 */
const mockTiledMapData = {
    tilewidth: 32,
    tileheight: 32,
    tilesets: [
        {
            name: 'SproutLands',
            image: 'SproutLandsGrassIslands.png',
            firstgid: 1,
        }
    ]
};

/**
 * Puzzle bounds anchored at world (0, 0) for simple tile ↔ world arithmetic.
 * At 32 px/tile, grid position (gx, gy) maps to world tile (gx, gy).
 */
const puzzleBounds = { x: 0, y: 0, width: 7 * 32, height: 7 * 32 } as any;

describe('OverworldBridgeManager', () => {
    let bridgesLayer: ReturnType<typeof makeBridgesLayer>;
    let collisionManager: { setCollisionAt: ReturnType<typeof vi.fn>; getCollisionAt: ReturnType<typeof vi.fn> };
    let manager: OverworldBridgeManager;

    beforeEach(() => {
        bridgesLayer = makeBridgesLayer();
        collisionManager = {
            setCollisionAt: vi.fn(),
            // Default: no tile has ALWAYS_HIGH, so setCollisionAt is always called
            getCollisionAt: vi.fn().mockReturnValue(CollisionType.WALKABLE),
        };
        manager = new OverworldBridgeManager(
            bridgesLayer as any,
            mockTiledMapData,
            collisionManager
        );
    });

    // -------------------------------------------------------------------------
    // Helper to read which CollisionType was set for a given world tile.
    // -------------------------------------------------------------------------
    function collisionSetAt(tx: number, ty: number): CollisionType | undefined {
        for (const call of collisionManager.setCollisionAt.mock.calls) {
            if (call[0] === tx && call[1] === ty) return call[2] as CollisionType;
        }
        return undefined;
    }

    // =========================================================================
    // Single vertical bridge — body tiles should become NARROW_NS
    // =========================================================================
    describe('single vertical bridge', () => {
        const bridge: Bridge = {
            id: 'v1',
            start: { x: 3, y: 1 }, // island at grid (3,1) = world tile (3,1)
            end: { x: 3, y: 5 },   // island at grid (3,5) = world tile (3,5)
            type: { id: 'single' }
        };

        beforeEach(() => {
            manager.bakePuzzleBridges('p1', puzzleBounds, [bridge]);
        });

        it('sets WALKABLE at the start island tile', () => {
            expect(collisionSetAt(3, 1)).toBe(CollisionType.WALKABLE);
        });

        it('sets WALKABLE at the end island tile', () => {
            expect(collisionSetAt(3, 5)).toBe(CollisionType.WALKABLE);
        });

        it('sets NARROW_NS on intermediate body tiles', () => {
            expect(collisionSetAt(3, 2)).toBe(CollisionType.NARROW_NS);
            expect(collisionSetAt(3, 3)).toBe(CollisionType.NARROW_NS);
            expect(collisionSetAt(3, 4)).toBe(CollisionType.NARROW_NS);
        });

        it('does not set NARROW_EW on any tile', () => {
            for (const call of collisionManager.setCollisionAt.mock.calls) {
                expect(call[2]).not.toBe(CollisionType.NARROW_EW);
            }
        });
    });

    // =========================================================================
    // Single horizontal bridge — body tiles should become NARROW_EW
    // =========================================================================
    describe('single horizontal bridge', () => {
        const bridge: Bridge = {
            id: 'h1',
            start: { x: 1, y: 3 },
            end: { x: 5, y: 3 },
            type: { id: 'single' }
        };

        beforeEach(() => {
            manager.bakePuzzleBridges('p2', puzzleBounds, [bridge]);
        });

        it('sets WALKABLE at the start island tile', () => {
            expect(collisionSetAt(1, 3)).toBe(CollisionType.WALKABLE);
        });

        it('sets WALKABLE at the end island tile', () => {
            expect(collisionSetAt(5, 3)).toBe(CollisionType.WALKABLE);
        });

        it('sets NARROW_EW on intermediate body tiles', () => {
            expect(collisionSetAt(2, 3)).toBe(CollisionType.NARROW_EW);
            expect(collisionSetAt(3, 3)).toBe(CollisionType.NARROW_EW);
            expect(collisionSetAt(4, 3)).toBe(CollisionType.NARROW_EW);
        });

        it('does not set NARROW_NS on any tile', () => {
            for (const call of collisionManager.setCollisionAt.mock.calls) {
                expect(call[2]).not.toBe(CollisionType.NARROW_NS);
            }
        });
    });

    // =========================================================================
    // Two parallel bridges between the same island pair — all tiles WALKABLE
    // =========================================================================
    describe('double vertical bridges between the same pair of islands', () => {
        const bridge1: Bridge = {
            id: 'v1',
            start: { x: 3, y: 1 },
            end: { x: 3, y: 5 },
            type: { id: 'single' }
        };
        const bridge2: Bridge = {
            id: 'v2',
            start: { x: 3, y: 1 },
            end: { x: 3, y: 5 },
            type: { id: 'single' }
        };

        beforeEach(() => {
            manager.bakePuzzleBridges('p3', puzzleBounds, [bridge1, bridge2]);
        });

        it('sets WALKABLE for every tile including body tiles', () => {
            for (let ty = 1; ty <= 5; ty++) {
                const ct = collisionSetAt(3, ty);
                if (ct !== undefined) {
                    expect(ct).toBe(CollisionType.WALKABLE);
                }
            }
        });

        it('does not assign any narrow-passage type', () => {
            for (const call of collisionManager.setCollisionAt.mock.calls) {
                expect(call[2]).not.toBe(CollisionType.NARROW_NS);
                expect(call[2]).not.toBe(CollisionType.NARROW_EW);
            }
        });
    });

    // =========================================================================
    // Two different vertical bridges (different island pairs) — each single,
    // so both should have NARROW_NS body tiles.
    // =========================================================================
    describe('two unrelated single vertical bridges', () => {
        const bridgeA: Bridge = {
            id: 'vA',
            start: { x: 1, y: 1 },
            end: { x: 1, y: 3 },
            type: { id: 'single' }
        };
        const bridgeB: Bridge = {
            id: 'vB',
            start: { x: 4, y: 2 },
            end: { x: 4, y: 4 },
            type: { id: 'single' }
        };

        beforeEach(() => {
            manager.bakePuzzleBridges('p4', puzzleBounds, [bridgeA, bridgeB]);
        });

        it('sets NARROW_NS for the body tile of bridge A', () => {
            expect(collisionSetAt(1, 2)).toBe(CollisionType.NARROW_NS);
        });

        it('sets NARROW_NS for the body tile of bridge B', () => {
            expect(collisionSetAt(4, 3)).toBe(CollisionType.NARROW_NS);
        });

        it('sets WALKABLE for the island endpoints of both bridges', () => {
            expect(collisionSetAt(1, 1)).toBe(CollisionType.WALKABLE);
            expect(collisionSetAt(1, 3)).toBe(CollisionType.WALKABLE);
            expect(collisionSetAt(4, 2)).toBe(CollisionType.WALKABLE);
            expect(collisionSetAt(4, 4)).toBe(CollisionType.WALKABLE);
        });
    });

    // =========================================================================
    // Bridge with start/end reversed — normalisation must treat it as the same
    // pair as the non-reversed version.
    // =========================================================================
    describe('direction-normalised island-pair counting', () => {
        const fwd: Bridge = { id: 'fwd', start: { x: 2, y: 1 }, end: { x: 2, y: 4 }, type: { id: 't' } };
        const rev: Bridge = { id: 'rev', start: { x: 2, y: 4 }, end: { x: 2, y: 1 }, type: { id: 't' } };

        it('counts forward and reversed bridge as the same pair → WALKABLE body', () => {
            manager.bakePuzzleBridges('p5', puzzleBounds, [fwd, rev]);
            for (let ty = 1; ty <= 4; ty++) {
                const ct = collisionSetAt(2, ty);
                if (ct !== undefined) {
                    expect(ct).toBe(CollisionType.WALKABLE);
                }
            }
        });
    });

    // =========================================================================
    // Adjacent-tile bridge (length 1 — start and end are adjacent, no body)
    // =========================================================================
    describe('length-1 bridge with no body tiles', () => {
        const bridge: Bridge = {
            id: 'short',
            start: { x: 3, y: 2 },
            end: { x: 3, y: 3 },
            type: { id: 'single' }
        };

        it('sets both tiles to WALKABLE (they are both endpoints)', () => {
            manager.bakePuzzleBridges('p6', puzzleBounds, [bridge]);
            expect(collisionSetAt(3, 2)).toBe(CollisionType.WALKABLE);
            expect(collisionSetAt(3, 3)).toBe(CollisionType.WALKABLE);
        });
    });
});
