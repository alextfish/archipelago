import { describe, it, expect, beforeEach } from 'vitest';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';

describe('OverworldGameState', () => {
    let gameState: OverworldGameState;
    let mockPuzzle: BridgePuzzle;

    beforeEach(() => {
        gameState = new OverworldGameState();

        // Create a mock puzzle
        mockPuzzle = new BridgePuzzle({
            id: 'test-puzzle',
            size: { width: 5, height: 5 },
            islands: [
                { id: 'island1', x: 1, y: 1 },
                { id: 'island2', x: 3, y: 1 }
            ],
            bridgeTypes: [
                { id: 'single', count: 5 }
            ],
            constraints: [],
            maxNumBridges: 2
        });
    });

    describe('setActivePuzzle', () => {
        it('should set the active puzzle correctly', () => {
            gameState.setActivePuzzle('puzzle1', mockPuzzle);

            const activePuzzle = gameState.getActivePuzzle();
            expect(activePuzzle).not.toBeNull();
            expect(activePuzzle?.id).toBe('puzzle1');
            expect(activePuzzle?.puzzle).toBe(mockPuzzle);
        });
    });

    describe('getActivePuzzle', () => {
        it('should return null when no puzzle is active', () => {
            const activePuzzle = gameState.getActivePuzzle();
            expect(activePuzzle).toBeNull();
        });

        it('should return the active puzzle when one is set', () => {
            gameState.setActivePuzzle('puzzle1', mockPuzzle);

            const activePuzzle = gameState.getActivePuzzle();
            expect(activePuzzle?.id).toBe('puzzle1');
            expect(activePuzzle?.puzzle).toBe(mockPuzzle);
        });
    });

    describe('clearActivePuzzle', () => {
        it('should save progress before clearing', () => {
            gameState.setActivePuzzle('puzzle1', mockPuzzle);
            gameState.clearActivePuzzle();

            expect(gameState.getActivePuzzle()).toBeNull();
            expect(gameState.hasSavedProgress('puzzle1')).toBe(true);
        });
    });

    describe('saveOverworldPuzzleProgress', () => {
        it('should save puzzle progress', () => {
            gameState.saveOverworldPuzzleProgress('puzzle1', mockPuzzle);

            expect(gameState.hasSavedProgress('puzzle1')).toBe(true);

            const loadedPuzzle = gameState.loadOverworldPuzzleProgress('puzzle1');
            expect(loadedPuzzle).toBe(mockPuzzle);
        });

        it('should update active puzzle if it matches', () => {
            gameState.setActivePuzzle('puzzle1', mockPuzzle);

            const newMockPuzzle = new BridgePuzzle({
                id: 'test-puzzle',
                size: { width: 5, height: 5 },
                islands: [{ id: 'island1', x: 1, y: 1 }],
                bridgeTypes: [{ id: 'single', count: 5 }],
                constraints: [],
                maxNumBridges: 2
            });

            gameState.saveOverworldPuzzleProgress('puzzle1', newMockPuzzle);

            const activePuzzle = gameState.getActivePuzzle();
            expect(activePuzzle?.puzzle).toBe(newMockPuzzle);
        });
    });

    describe('loadOverworldPuzzleProgress', () => {
        it('should return null for non-existent puzzle', () => {
            const loadedPuzzle = gameState.loadOverworldPuzzleProgress('non-existent');
            expect(loadedPuzzle).toBeNull();
        });

        it('should return saved puzzle progress', () => {
            gameState.saveOverworldPuzzleProgress('puzzle1', mockPuzzle);

            const loadedPuzzle = gameState.loadOverworldPuzzleProgress('puzzle1');
            expect(loadedPuzzle).toBe(mockPuzzle);
        });
    });

    describe('markPuzzleCompleted', () => {
        it('should mark puzzle as completed and preserve existing saved progress', () => {
            gameState.saveOverworldPuzzleProgress('puzzle1', mockPuzzle);
            expect(gameState.hasSavedProgress('puzzle1')).toBe(true);

            gameState.markPuzzleCompleted('puzzle1');

            expect(gameState.isPuzzleCompleted('puzzle1')).toBe(true);
            expect(gameState.hasSavedProgress('puzzle1')).toBe(true);
            expect(gameState.loadOverworldPuzzleProgress('puzzle1')).toBe(mockPuzzle);
        });

        it('should persist the active puzzle state when marking the active puzzle as completed', () => {
            gameState.setActivePuzzle('puzzle1', mockPuzzle);

            gameState.markPuzzleCompleted('puzzle1');

            expect(gameState.isPuzzleCompleted('puzzle1')).toBe(true);
            expect(gameState.hasSavedProgress('puzzle1')).toBe(true);
            expect(gameState.loadOverworldPuzzleProgress('puzzle1')).toBe(mockPuzzle);
        });
    });

    describe('isPuzzleCompleted', () => {
        it('should return false for non-completed puzzle', () => {
            expect(gameState.isPuzzleCompleted('puzzle1')).toBe(false);
        });

        it('should return true for completed puzzle', () => {
            gameState.markPuzzleCompleted('puzzle1');
            expect(gameState.isPuzzleCompleted('puzzle1')).toBe(true);
        });
    });

    describe('hasSavedProgress', () => {
        it('should return false for puzzle with no progress', () => {
            expect(gameState.hasSavedProgress('puzzle1')).toBe(false);
        });

        it('should return true for puzzle with saved progress', () => {
            gameState.saveOverworldPuzzleProgress('puzzle1', mockPuzzle);
            expect(gameState.hasSavedProgress('puzzle1')).toBe(true);
        });
    });

    describe('getCompletedPuzzles', () => {
        it('should return empty array initially', () => {
            expect(gameState.getCompletedPuzzles()).toEqual([]);
        });

        it('should return completed puzzles', () => {
            gameState.markPuzzleCompleted('puzzle1');
            gameState.markPuzzleCompleted('puzzle2');

            const completed = gameState.getCompletedPuzzles();
            expect(completed).toContain('puzzle1');
            expect(completed).toContain('puzzle2');
            expect(completed).toHaveLength(2);
        });
    });

    describe('getPuzzlesWithProgress', () => {
        it('should return empty array initially', () => {
            expect(gameState.getPuzzlesWithProgress()).toEqual([]);
        });

        it('should return puzzles with saved progress', () => {
            gameState.saveOverworldPuzzleProgress('puzzle1', mockPuzzle);
            gameState.saveOverworldPuzzleProgress('puzzle2', mockPuzzle);

            const withProgress = gameState.getPuzzlesWithProgress();
            expect(withProgress).toContain('puzzle1');
            expect(withProgress).toContain('puzzle2');
            expect(withProgress).toHaveLength(2);
        });
    });

    describe('getDebugInfo', () => {
        it('should return correct debug information', () => {
            gameState.setActivePuzzle('active-puzzle', mockPuzzle);
            gameState.saveOverworldPuzzleProgress('progress-puzzle', mockPuzzle);
            gameState.markPuzzleCompleted('completed-puzzle');

            const debugInfo = gameState.getDebugInfo();

            expect(debugInfo.activePuzzle).toBe('active-puzzle');
            expect(debugInfo.totalProgress).toBe(1);
            expect(debugInfo.totalCompleted).toBe(1);
            expect(debugInfo.progressPuzzles).toContain('progress-puzzle');
            expect(debugInfo.completedPuzzles).toContain('completed-puzzle');
        });
    });

    describe('reset', () => {
        it('should clear all state', () => {
            gameState.setActivePuzzle('puzzle1', mockPuzzle);
            gameState.saveOverworldPuzzleProgress('puzzle2', mockPuzzle);
            gameState.markPuzzleCompleted('puzzle3');

            gameState.reset();

            expect(gameState.getActivePuzzle()).toBeNull();
            expect(gameState.getPuzzlesWithProgress()).toEqual([]);
            expect(gameState.getCompletedPuzzles()).toEqual([]);
        });
    });

    describe('collectibles and jewels', () => {
        it('should track collected collectible IDs without double-counting jewels', () => {
            gameState.collectJewel('green', 'collectible-1');
            gameState.collectJewel('green', 'collectible-1');

            expect(gameState.getJewelCount('green')).toBe(1);
            expect(gameState.isCollectibleCollected('collectible-1')).toBe(true);
            expect(gameState.getCollectedCollectibleIDs()).toEqual(['collectible-1']);
        });
    });

    describe('exportState', () => {
        it('should export current state', () => {
            gameState.setActivePuzzle('active-puzzle', mockPuzzle);
            gameState.markPuzzleCompleted('completed-puzzle');
            gameState.unlockDoor('door-1');
            gameState.collectJewel('blue', 'collectible-2');

            const exported = gameState.exportState();

            expect(exported.activePuzzleId).toBe('active-puzzle');
            expect(exported.completedPuzzles).toContain('completed-puzzle');
            expect(exported.puzzleProgress).toBeDefined();
            expect(exported.unlockedDoors).toContain('door-1');
            expect(exported.collectedJewels.blue).toBe(1);
            expect(exported.collectedCollectibleIDs).toContain('collectible-2');
        });
    });

    describe('importState', () => {
        it('should import state correctly', () => {
            const stateToImport = {
                activePuzzleId: 'imported-active',
                puzzleProgress: {},
                completedPuzzles: ['imported-completed'],
                unlockedDoors: ['door-2'],
                collectedJewels: { yellow: 2 },
                collectedCollectibleIDs: ['collectible-3']
            };

            gameState.importState(stateToImport);

            const debugInfo = gameState.getDebugInfo();
            expect(debugInfo.activePuzzle).toBe('imported-active');
            expect(debugInfo.completedPuzzles).toContain('imported-completed');
            expect(gameState.isDoorUnlocked('door-2')).toBe(true);
            expect(gameState.getJewelCount('yellow')).toBe(2);
            expect(gameState.isCollectibleCollected('collectible-3')).toBe(true);
        });

        it('should restore saved bridge progress onto freshly loaded puzzles', () => {
            mockPuzzle.placeBridge('b1', { x: 1, y: 1 }, { x: 3, y: 1 });
            gameState.saveOverworldPuzzleProgress('test-puzzle', mockPuzzle);

            const exported = gameState.exportState();

            const reloadedState = new OverworldGameState();
            reloadedState.importState(exported);

            const freshPuzzle = new BridgePuzzle({
                id: 'test-puzzle',
                size: { width: 5, height: 5 },
                islands: [
                    { id: 'island1', x: 1, y: 1 },
                    { id: 'island2', x: 3, y: 1 }
                ],
                bridgeTypes: [
                    { id: 'single', count: 5 }
                ],
                constraints: [],
                maxNumBridges: 2
            });

            reloadedState.restorePuzzleProgress(new Map([[freshPuzzle.id, freshPuzzle]]));

            const restored = reloadedState.loadOverworldPuzzleProgress('test-puzzle');
            expect(restored).toBe(freshPuzzle);
            expect(restored?.placedBridges).toHaveLength(1);
            expect(restored?.placedBridges[0].start).toEqual({ x: 1, y: 1 });
            expect(restored?.placedBridges[0].end).toEqual({ x: 3, y: 1 });
        });
    });
});