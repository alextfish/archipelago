import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollisionManager } from '@model/overworld/CollisionManager';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { Bridge } from '@model/puzzle/Bridge';

describe('CollisionManager', () => {
    let mockOverworldScene: any;
    let collisionManager: CollisionManager;
    let mockPuzzle: BridgePuzzle;
    let puzzleBounds: Phaser.Geom.Rectangle;

    beforeEach(() => {
        mockOverworldScene = {
            hasCollisionAt: vi.fn().mockReturnValue(false),
            setCollisionAt: vi.fn()
        };

        collisionManager = new CollisionManager(mockOverworldScene);

        mockPuzzle = new BridgePuzzle({
            id: 'test-puzzle',
            size: { width: 5, height: 5 },
            islands: [
                { id: 'island1', x: 1, y: 1 },
                { id: 'island2', x: 3, y: 1 }
            ],
            bridgeTypes: [
                { id: 'test-bridge', count: 5 }
            ],
            constraints: [],
            maxNumBridges: 2
        });

        puzzleBounds = { x: 100, y: 200, width: 160, height: 160 } as any; // 5x5 tiles at 32px each
    });

    describe('updateCollisionFromBridges', () => {
        it('should store original collision state', () => {
            collisionManager.updateCollisionFromBridges(mockPuzzle, puzzleBounds);

            // Should check collision for all tiles in puzzle area
            const expectedCalls = Math.ceil(puzzleBounds.width / 32) * Math.ceil(puzzleBounds.height / 32);
            expect(mockOverworldScene.hasCollisionAt).toHaveBeenCalledTimes(expectedCalls);
        });

        it('should apply collision for bridges', () => {
            // Place a bridge first - get the first available bridge ID
            const bridgeId = mockPuzzle.inventory.bridges[0].id;
            mockPuzzle.placeBridge(bridgeId, { x: 1, y: 1 }, { x: 3, y: 1 });

            collisionManager.updateCollisionFromBridges(mockPuzzle, puzzleBounds);

            // Should set collision for bridge tiles
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                true
            );
        });
    });

    describe('restoreOriginalCollision', () => {
        it('should restore collision to original state', () => {
            // Place a bridge first - get the first available bridge ID
            const bridgeId = mockPuzzle.inventory.bridges[0].id;
            mockPuzzle.placeBridge(bridgeId, { x: 1, y: 1 }, { x: 3, y: 1 });

            // First update collision
            collisionManager.updateCollisionFromBridges(mockPuzzle, puzzleBounds);

            // Then restore
            collisionManager.restoreOriginalCollision();

            // Should have set collision back to original values
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                false // Original value from mock
            );
        });

        it('should warn if no puzzle bounds stored', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            collisionManager.restoreOriginalCollision();

            expect(consoleSpy).toHaveBeenCalledWith('No puzzle bounds stored for collision restoration');
            consoleSpy.mockRestore();
        });
    });

    describe('addBridgeCollision', () => {
        it('should add collision for single bridge', () => {
            const bridge: Bridge = {
                id: 'new-bridge',
                start: { x: 2, y: 2 },
                end: { x: 4, y: 2 },
                type: { id: 'single' }
            };

            collisionManager.addBridgeCollision(bridge, puzzleBounds);

            // Should set collision for bridge tiles
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                true
            );
        });

        it('should handle bridge without start/end coordinates', () => {
            const bridge: Bridge = {
                id: 'incomplete-bridge',
                type: { id: 'single' }
            };

            // Should not throw error
            expect(() => {
                collisionManager.addBridgeCollision(bridge, puzzleBounds);
            }).not.toThrow();

            // Should not call setCollisionAt
            expect(mockOverworldScene.setCollisionAt).not.toHaveBeenCalled();
        });
    });

    describe('removeBridgeCollision', () => {
        it('should remove collision for bridge', () => {
            const bridge: Bridge = {
                id: 'bridge-to-remove',
                start: { x: 2, y: 2 },
                end: { x: 4, y: 2 },
                type: { id: 'single' }
            };

            // Place a bridge in the puzzle first - get the first available bridge ID
            const bridgeId = mockPuzzle.inventory.bridges[0].id;
            mockPuzzle.placeBridge(bridgeId, { x: 1, y: 1 }, { x: 3, y: 1 });

            // First set up some collision state
            collisionManager.updateCollisionFromBridges(mockPuzzle, puzzleBounds);

            // Then remove bridge collision
            collisionManager.removeBridgeCollision(bridge, puzzleBounds);

            // Should restore collision for bridge tiles
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                false // Original collision value
            );
        });

        it('should handle bridge without start/end coordinates', () => {
            const bridge: Bridge = {
                id: 'incomplete-bridge',
                type: { id: 'single' }
            };

            // Should not throw error
            expect(() => {
                collisionManager.removeBridgeCollision(bridge, puzzleBounds);
            }).not.toThrow();
        });
    });

    describe('getBridgeTilePositions', () => {
        it('should calculate horizontal bridge positions correctly', () => {
            const bridge: Bridge = {
                id: 'horizontal-bridge',
                start: { x: 1, y: 2 },
                end: { x: 3, y: 2 },
                type: { id: 'single' }
            };

            collisionManager.addBridgeCollision(bridge, puzzleBounds);

            // Should set collision for all tiles in horizontal bridge (1,2) to (3,2)
            // Bridge covers tiles at x=1,2,3 y=2
            const expectedTileY = Math.floor((puzzleBounds.y + 2 * 32) / 32);

            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                Math.floor((puzzleBounds.x + 1 * 32) / 32),
                expectedTileY,
                true
            );
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                Math.floor((puzzleBounds.x + 2 * 32) / 32),
                expectedTileY,
                true
            );
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                Math.floor((puzzleBounds.x + 3 * 32) / 32),
                expectedTileY,
                true
            );
        });

        it('should calculate vertical bridge positions correctly', () => {
            const bridge: Bridge = {
                id: 'vertical-bridge',
                start: { x: 2, y: 1 },
                end: { x: 2, y: 3 },
                type: { id: 'single' }
            };

            collisionManager.addBridgeCollision(bridge, puzzleBounds);

            // Should set collision for all tiles in vertical bridge (2,1) to (2,3)
            // Bridge covers tiles at x=2 y=1,2,3
            const expectedTileX = Math.floor((puzzleBounds.x + 2 * 32) / 32);

            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expectedTileX,
                Math.floor((puzzleBounds.y + 1 * 32) / 32),
                true
            );
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expectedTileX,
                Math.floor((puzzleBounds.y + 2 * 32) / 32),
                true
            );
            expect(mockOverworldScene.setCollisionAt).toHaveBeenCalledWith(
                expectedTileX,
                Math.floor((puzzleBounds.y + 3 * 32) / 32),
                true
            );
        });
    });
});