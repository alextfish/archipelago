import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverworldPuzzleController } from '@controller/OverworldPuzzleController';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import { makeMockPuzzle } from '../helpers/MockFactories';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import type { FlowPuzzleSpec } from '@model/puzzle/FlowTypes';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';

describe('OverworldPuzzleController', () => {
    let controller: OverworldPuzzleController;
    let gameState: OverworldGameState;
    let puzzleManager: OverworldPuzzleManager;
    let mockScene: any;
    let cameraManager: any;
    let collisionManager: any;
    let bridgeManager: any;
    let tiledMapData: any;
    let mockPuzzle: BridgePuzzle;

    beforeEach(() => {
        // Minimal scene mock - only what's needed for construction
        mockScene = {
            events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
        };

        // Real game state
        gameState = new OverworldGameState();

        // Real puzzle manager
        puzzleManager = new OverworldPuzzleManager(defaultTileConfig);

        // Create mock puzzle
        mockPuzzle = makeMockPuzzle({
            id: 'test-puzzle',
            islands: [
                { id: 'A', x: 1, y: 1 },
                { id: 'B', x: 3, y: 1 }
            ],
            bridges: [],
            width: 5,
            height: 5
        });

        // Mock puzzle manager methods
        vi.spyOn(puzzleManager, 'getPuzzleById').mockReturnValue(mockPuzzle);
        vi.spyOn(puzzleManager, 'getPuzzleBounds').mockReturnValue({
            x: 0, y: 0, width: 160, height: 160
        });

        // Mock managers
        cameraManager = {
            storeCameraState: vi.fn(),
            transitionToPuzzle: vi.fn().mockResolvedValue(undefined),
            transitionToOverworld: vi.fn().mockResolvedValue(undefined),
            isInPuzzleView: vi.fn().mockReturnValue(false)
        };

        collisionManager = {
            updateCollisionFromBridges: vi.fn(),
            restoreOriginalCollision: vi.fn(),
            applyFlowWaterCollision: vi.fn()
        };

        bridgeManager = {
            blankPuzzleRegion: vi.fn(),
            bakePuzzleBridges: vi.fn()
        };

        tiledMapData = {
            tilewidth: 32,
            tileheight: 32
        };

        // Create controller
        controller = new OverworldPuzzleController(
            mockScene,
            gameState,
            puzzleManager,
            cameraManager,
            collisionManager,
            bridgeManager,
            tiledMapData
        );

        vi.spyOn(PuzzleHUDManager, 'getInstance').mockReturnValue({
            hideControlsForOverworld: vi.fn(),
            exitPuzzle: vi.fn()
        } as any);
    });

    describe('FlowPuzzle cancel exit', () => {
        it('clears placed bridges before restoring water collision on cancelled unsolved exit', async () => {
            const flowSpec: FlowPuzzleSpec = {
                id: 'test-flow-puzzle',
                type: 'flow',
                size: { width: 3, height: 3 },
                islands: [
                    { id: 'A', x: 0, y: 1 },
                    { id: 'B', x: 2, y: 1 }
                ],
                bridgeTypes: [
                    { id: 'basic', length: 2, count: 1 }
                ],
                constraints: [],
                maxNumBridges: 2,
                flowSquares: [
                    { x: 1, y: 1, isSource: true, outgoing: [] }
                ]
            };

            const flowPuzzle = new FlowPuzzle(flowSpec);
            const bridge = flowPuzzle.inventory.getAvailableOfType('basic')[0];
            flowPuzzle.placeBridge(bridge.id, { x: 0, y: 1 }, { x: 2, y: 1 });

            expect(flowPuzzle.placedBridges.length).toBe(1);
            expect(flowPuzzle.tileHasWater(1, 1)).toBe(false);

            vi.spyOn(puzzleManager, 'getPuzzleBounds').mockReturnValue({ x: 0, y: 0, width: 96, height: 96 });
            gameState.setActivePuzzle(flowPuzzle.id, flowPuzzle);

            await controller.exitPuzzle(false, () => { });

            expect(flowPuzzle.placedBridges.length).toBe(0);
            expect(flowPuzzle.tileHasWater(1, 1)).toBe(true);
            expect(collisionManager.applyFlowWaterCollision).toHaveBeenCalledWith([
                { tileX: 1, tileY: 1 }
            ]);
        });
    });

    describe('determineExitMode', () => {
        it('should return true when success is requested as true', () => {
            // Use any to access private method for testing
            const result = (controller as any).determineExitMode(true);
            expect(result).toBe(true);
        });

        it('should return false when success is false and no active puzzle', () => {
            const result = (controller as any).determineExitMode(false);
            expect(result).toBe(false);
        });

        it('should return true when success is false but puzzle is solved', () => {
            // Set up a mock active controller that reports puzzle as solved
            const mockController = {
                isSolved: vi.fn().mockReturnValue(true)
            };
            (controller as any).activePuzzleController = mockController;

            const result = (controller as any).determineExitMode(false);
            expect(result).toBe(true);
            expect(mockController.isSolved).toHaveBeenCalled();
        });

        it('should return false when success is false and puzzle is not solved', () => {
            const mockController = {
                isSolved: vi.fn().mockReturnValue(false)
            };
            (controller as any).activePuzzleController = mockController;

            const result = (controller as any).determineExitMode(false);
            expect(result).toBe(false);
        });
    });

    describe('determineExitAction', () => {
        it('should return bake when success is true', () => {
            const result = (controller as any).determineExitAction(true, 'test-puzzle');
            expect(result).toBe('bake');
        });

        it('should return blank when success is false and puzzle was completed', () => {
            gameState.markPuzzleCompleted('test-puzzle');

            const result = (controller as any).determineExitAction(false, 'test-puzzle');
            expect(result).toBe('blank');
        });

        it('should return restore when success is false and puzzle was not completed', () => {
            const result = (controller as any).determineExitAction(false, 'test-puzzle');
            expect(result).toBe('restore');
        });
    });

    describe('state queries', () => {
        it('should report not in puzzle mode initially', () => {
            expect(controller.isInPuzzleMode()).toBe(false);
        });

        it('should return null active puzzle initially', () => {
            expect(controller.getActivePuzzle()).toBeNull();
        });

        it('should return undefined puzzle ID initially', () => {
            expect(controller.getCurrentPuzzleId()).toBeUndefined();
        });
    });

    describe('handleUndo', () => {
        it('should do nothing when no active puzzle controller', () => {
            // Should not throw
            expect(() => controller.handleUndo()).not.toThrow();
        });

        it('should call undo on active puzzle controller', () => {
            const mockController = {
                undo: vi.fn()
            };
            (controller as any).activePuzzleController = mockController;

            controller.handleUndo();
            expect(mockController.undo).toHaveBeenCalled();
        });
    });

    describe('handleRedo', () => {
        it('should do nothing when no active puzzle controller', () => {
            expect(() => controller.handleRedo()).not.toThrow();
        });

        it('should call redo on active puzzle controller', () => {
            const mockController = {
                redo: vi.fn()
            };
            (controller as any).activePuzzleController = mockController;

            controller.handleRedo();
            expect(mockController.redo).toHaveBeenCalled();
        });
    });

    describe('handleBridgeClicked', () => {
        it('should do nothing when no active puzzle controller', () => {
            expect(() => controller.handleBridgeClicked('bridge-1')).not.toThrow();
        });

        it('should call removeBridge on active puzzle controller', () => {
            const mockController = {
                removeBridge: vi.fn()
            };
            (controller as any).activePuzzleController = mockController;

            controller.handleBridgeClicked('bridge-1');
            expect(mockController.removeBridge).toHaveBeenCalledWith('bridge-1');
        });
    });
});
