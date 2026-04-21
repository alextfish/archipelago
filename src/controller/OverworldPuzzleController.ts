import Phaser from 'phaser';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { CollisionManager } from '@model/overworld/CollisionManager';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import { CameraManager } from '@view/CameraManager';
import { EmbeddedPuzzleRenderer } from '@view/EmbeddedPuzzleRenderer';
import { FlowPuzzleRenderer } from '@view/FlowPuzzleRenderer';
import { PuzzleController } from '@controller/PuzzleController';
import { PuzzleInputHandler } from '@controller/PuzzleInputHandler';
import type { PuzzleHost } from '@controller/PuzzleHost';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';

/**
 * Result returned from exitPuzzle(), describing what happened to the puzzle state.
 */
export interface PuzzleExitResult {
    /** The ID of the puzzle that was exited */
    puzzleId: string;
    /** True if the puzzle was just solved and bridges were baked (action = 'bake') */
    wasSolved: boolean;
    /** True if a previously-solved puzzle was un-solved and bridges were cleared (action = 'blank') */
    wasUnsolved: boolean;
}

/**
 * Coordinates the lifecycle of overworld puzzle solving:
 * - Entering puzzle mode (camera transitions, renderer setup, HUD)
 * - Managing active puzzle state
 * - Exiting puzzle mode (saving progress, baking bridges)
 * 
 * This is controller layer - orchestrates between model and view without
 * containing puzzle logic or rendering code.
 */
export class OverworldPuzzleController {
    private activePuzzleController?: PuzzleController;
    private puzzleRenderer?: EmbeddedPuzzleRenderer;
    private puzzleInputHandler?: PuzzleInputHandler;
    private isExitingPuzzle: boolean = false;
    private currentPuzzleId?: string;

    constructor(
        private scene: Phaser.Scene,
        private gameState: OverworldGameState,
        private puzzleManager: OverworldPuzzleManager,
        private cameraManager: CameraManager,
        private collisionManager: CollisionManager,
        private bridgeManager: OverworldBridgeManager | undefined,
        private tiledMapData: any
    ) { }

    /**
     * Enter puzzle solving mode for a specific puzzle
     * 
     * @param puzzleId - ID of the puzzle to enter
     * @param onModeChange - Callback when puzzle mode is entered (for view updates)
     * @returns Promise that resolves when puzzle entry is complete
     */
    public async enterPuzzle(
        puzzleId: string,
        onModeChange: (mode: 'puzzle') => void,
        onFlowTileChanged?: (lx: number, ly: number, hasWater: boolean) => void
    ): Promise<void> {
        console.log(`OverworldPuzzleController: Entering puzzle: ${puzzleId}`);

        if (!this.tiledMapData) {
            console.error('No tilemap data available for puzzle entry');
            throw new Error('No tilemap data available');
        }

        // Get the puzzle
        const puzzle = this.puzzleManager.getPuzzleById(puzzleId);
        if (!puzzle) {
            console.error(`Puzzle not found: ${puzzleId}`);
            throw new Error(`Puzzle not found: ${puzzleId}`);
        }

        // Get puzzle bounds
        const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
        if (!puzzleBounds) {
            console.error(`No bounds found for puzzle: ${puzzleId}`);
            throw new Error(`No bounds found for puzzle: ${puzzleId}`);
        }

        try {
            // Set active puzzle in game state
            this.gameState.setActivePuzzle(puzzleId, puzzle);
            this.currentPuzzleId = puzzleId;

            // Create puzzle bounds rectangle
            const boundsRect = new Phaser.Geom.Rectangle(
                puzzleBounds.x,
                puzzleBounds.y,
                puzzleBounds.width,
                puzzleBounds.height
            );

            // Notify view to enter puzzle mode (disables player, hides cursor, etc.)
            onModeChange('puzzle');

            // Store camera state and transition to puzzle view
            this.cameraManager.storeCameraState();
            await this.cameraManager.transitionToPuzzle(boundsRect);

            // Clear baked overworld bridges now that the camera has arrived, so they vanish
            // at the same moment the puzzle-view bridges are drawn by enterPuzzle() below.
            // If the puzzle was previously solved, clear the exact baked tiles first.
            // blankPuzzleRegion uses bounds arithmetic and may miss edge-of-bounds tiles;
            // clearBakedTiles removes precisely the tiles that were placed at bake time.
            if (this.gameState.isPuzzleCompleted(puzzleId) && this.bridgeManager) {
                this.bridgeManager.clearBakedTiles(puzzleId);
            }

            // Blank this puzzle's region from bridges layer (whether completed or not)
            // This allows editing and restores proper collision
            if (this.bridgeManager) {
                this.bridgeManager.blankPuzzleRegion(puzzleId, boundsRect);
            }

            // Create embedded puzzle renderer — use FlowPuzzleRenderer for FlowPuzzle instances
            this.puzzleRenderer = puzzle instanceof FlowPuzzle
                ? new FlowPuzzleRenderer(this.scene, boundsRect, 'sprout-tiles')
                : new EmbeddedPuzzleRenderer(this.scene, boundsRect, 'sprout-tiles');

            // Inject glyph tracker so constraint speech bubbles register for Translation Mode
            this.puzzleRenderer.setGlyphTracker(this.gameState.glyphTracker);

            // Wire the per-tile visual callback before init() so syncVisuals() fires correctly
            if (this.puzzleRenderer instanceof FlowPuzzleRenderer && onFlowTileChanged) {
                this.puzzleRenderer.setTileVisualCallback(onFlowTileChanged);
            }

            // Create puzzle controller with host callbacks
            this.activePuzzleController = new PuzzleController(
                puzzle,
                this.puzzleRenderer,
                this.createPuzzleHost(puzzleId)
            );

            // Set up input handling for puzzle
            this.puzzleInputHandler = new PuzzleInputHandler(
                this.scene,
                this.activePuzzleController,
                this.puzzleRenderer
            );

            // Initialize puzzle systems
            this.puzzleRenderer.init(puzzle);
            this.puzzleInputHandler.setupInputHandlers();
            this.activePuzzleController.enterPuzzle();

            // Update collision for bridges.
            // For FlowPuzzles: first reset all flow square tiles to WALKABLE_LOW so the snapshot
            // captures the correct riverbed base state. Without this the snapshot would hold
            // BLOCKED (from map-load water initialisation) and restoreOriginalCollision() would
            // leave dried-up riverbeds impassable after a solve.
            if (puzzle instanceof FlowPuzzle && this.tiledMapData) {
                const tileW: number = this.tiledMapData.tilewidth ?? 32;
                const tileH: number = this.tiledMapData.tileheight ?? 32;
                const originTileX = Math.floor(boundsRect.x / tileW);
                const originTileY = Math.floor(boundsRect.y / tileH);
                const allFlowTiles: { tileX: number; tileY: number }[] = [];
                for (let ly = 0; ly < puzzle.height; ly++) {
                    for (let lx = 0; lx < puzzle.width; lx++) {
                        if (puzzle.getFlowSquare(lx, ly)) {
                            allFlowTiles.push({ tileX: originTileX + lx, tileY: originTileY + ly });
                        }
                    }
                }
                this.collisionManager.resetFlowTilesToWalkableLow(allFlowTiles);
            }
            this.collisionManager.updateCollisionFromBridges(puzzle, boundsRect);

            // Show HUD using PuzzleHUDManager
            PuzzleHUDManager.getInstance().enterPuzzle(
                this.scene,
                this.activePuzzleController,
                'overworld'
            );

            // Emit puzzle setup events for HUD
            const bridgeTypes = puzzle.getAvailableBridgeTypes();
            console.log('OverworldPuzzleController: Emitting setTypes with', bridgeTypes);
            this.scene.events.emit('setTypes', bridgeTypes);

            const counts = puzzle.availableCounts();
            console.log('OverworldPuzzleController: Emitting updateCounts with', counts);
            this.scene.events.emit('updateCounts', counts);

            console.log(`Successfully entered puzzle: ${puzzleId}`);

        } catch (error) {
            console.error(`Failed to enter puzzle: ${puzzleId}`, error);
            // Clean up and exit on error
            await this.exitPuzzle(false, () => { });
            throw error;
        }
    }

    /**
     * Determines the actual exit mode based on success flag and current puzzle state.
     * If player cancels but puzzle is currently solved, treats it as success.
     * 
     * @param requestedSuccess - Whether exit was requested as success
     * @returns The actual exit mode to use
     */
    private determineExitMode(requestedSuccess: boolean): boolean {
        if (!requestedSuccess && this.activePuzzleController) {
            const isSolved = this.activePuzzleController.isSolved();
            if (isSolved) {
                console.log('Puzzle is currently solved despite exit request - treating as success');
                return true;
            }
        }
        return requestedSuccess;
    }

    /**
     * Determines how to handle bridges and collision when exiting a puzzle.
     * 
     * @param success - Whether puzzle was solved
     * @param puzzleId - ID of the puzzle being exited
     * @returns Action to take: 'bake', 'blank', or 'restore'
     */
    private determineExitAction(success: boolean, puzzleId: string): 'bake' | 'blank' | 'restore' {
        if (success) {
            return 'bake';
        }

        const wasCompleted = this.gameState.isPuzzleCompleted(puzzleId);
        if (wasCompleted) {
            return 'blank';
        }

        return 'restore';
    }

    /**
     * Compute world tile coordinates of all tiles that currently have water in a FlowPuzzle.
     * Used by exit branches to correctly block still-flowing water in the overworld.
     */
    private getFlowWetWorldTiles(
        flowPuzzle: FlowPuzzle,
        puzzleBounds: { x: number; y: number }
    ): { tileX: number; tileY: number }[] {
        const tileW: number = this.tiledMapData?.tilewidth ?? 32;
        const tileH: number = this.tiledMapData?.tileheight ?? 32;
        const originTileX = Math.floor(puzzleBounds.x / tileW);
        const originTileY = Math.floor(puzzleBounds.y / tileH);
        const wetWorldTiles: { tileX: number; tileY: number }[] = [];
        for (let ly = 0; ly < flowPuzzle.height; ly++) {
            for (let lx = 0; lx < flowPuzzle.width; lx++) {
                if (flowPuzzle.tileHasWater(lx, ly)) {
                    wetWorldTiles.push({ tileX: originTileX + lx, tileY: originTileY + ly });
                }
            }
        }
        return wetWorldTiles;
    }

    /**
     * Exit puzzle solving mode
     * 
     * @param success - Whether the puzzle was solved or cancelled
     * @param onModeChange - Callback when returning to exploration mode
     * @returns Promise resolving with information about the puzzle exit action
     */
    public async exitPuzzle(
        success: boolean,
        onModeChange: (mode: 'exploration') => void,
        onBeforeTransition?: () => void
    ): Promise<PuzzleExitResult> {
        // Guard against re-entrant calls (prevents infinite loop when puzzle is solved)
        if (this.isExitingPuzzle) {
            console.log('Already exiting puzzle, ignoring duplicate call');
            return { puzzleId: this.currentPuzzleId ?? '', wasSolved: false, wasUnsolved: false };
        }

        const activeData = this.gameState.getActivePuzzle();
        if (!activeData) {
            console.warn('No active puzzle to exit');
            return { puzzleId: '', wasSolved: false, wasUnsolved: false };
        }

        console.log(`OverworldPuzzleController: Exiting puzzle: ${activeData.id} (success: ${success})`);

        // Determine actual exit mode (may upgrade cancel to success if puzzle is solved)
        const actualSuccess = this.determineExitMode(success);
        console.log(`Final exit mode: ${actualSuccess ? 'SOLVED' : 'CANCELLED'}`);

        this.isExitingPuzzle = true;

        try {
            // Hide puzzle controls (sidebar) immediately, but keep the solved overlay
            // visible in the HUD scene so it remains on screen during the camera pan.
            // The full HUD cleanup (hiding overlay + scene) happens after the pan.
            PuzzleHUDManager.getInstance().hideControlsForOverworld();

            // Save puzzle state before exiting
            if (this.activePuzzleController) {
                this.gameState.saveOverworldPuzzleProgress(activeData.id, activeData.puzzle);
            }

            // Clean up puzzle input handler
            if (this.puzzleInputHandler) {
                this.puzzleInputHandler.destroy();
                this.puzzleInputHandler = undefined;
            }

            // Clean up puzzle renderer
            if (this.puzzleRenderer) {
                this.puzzleRenderer.destroy();
                this.puzzleRenderer = undefined;
            }

            // Handle collision and bridge rendering based on whether puzzle was solved
            const puzzleBounds = this.puzzleManager.getPuzzleBounds(activeData.id);
            console.log(`[exitPuzzle] Got puzzle bounds for ${activeData.id}:`, puzzleBounds);
            const boundsRect = puzzleBounds ? new Phaser.Geom.Rectangle(
                puzzleBounds.x,
                puzzleBounds.y,
                puzzleBounds.width,
                puzzleBounds.height
            ) : null;
            console.log(`[exitPuzzle] Created boundsRect:`, boundsRect);

            const action = this.determineExitAction(actualSuccess, activeData.id);

            if (action === 'bake') {
                // Puzzle solved: restore original collision first, then bake bridges
                console.log('Puzzle solved - restoring collision and baking bridges to overworld');
                console.log(`[exitPuzzle] About to bake ${activeData.puzzle.bridges.length} bridges`);
                this.collisionManager.restoreOriginalCollision();
                if (this.bridgeManager && boundsRect) {
                    const bridges = activeData.puzzle.bridges;
                    this.bridgeManager.bakePuzzleBridges(activeData.id, boundsRect, bridges);
                }
                // For FlowPuzzles: block tiles where water is still flowing after the solution.
                // Tiles that dried up remain WALKABLE_LOW (their restored original state).
                if (activeData.puzzle instanceof FlowPuzzle && puzzleBounds) {
                    this.collisionManager.applyFlowWaterCollision(
                        this.getFlowWetWorldTiles(activeData.puzzle, puzzleBounds)
                    );
                }
                this.gameState.markPuzzleCompleted(activeData.id);
            } else if (action === 'blank') {
                // Previously completed puzzle cancelled: restore collision then re-apply current
                // water state (player removed bridges so water reflowed).
                console.log('Previously completed puzzle cancelled - clearing completion status');
                this.gameState.clearPuzzleCompletion(activeData.id);
                this.collisionManager.restoreOriginalCollision();
                if (activeData.puzzle instanceof FlowPuzzle && puzzleBounds) {
                    this.collisionManager.applyFlowWaterCollision(
                        this.getFlowWetWorldTiles(activeData.puzzle, puzzleBounds)
                    );
                }
                if (this.bridgeManager && boundsRect) {
                    this.bridgeManager.blankPuzzleRegion(activeData.id, boundsRect);
                }
            } else {
                // Never completed puzzle cancelled: restore collision then re-apply water blocking
                // so the overworld reflects the current (partially-solved) water state.
                console.log('Incomplete puzzle cancelled - restoring collision');
                this.collisionManager.restoreOriginalCollision();
                if (activeData.puzzle instanceof FlowPuzzle && puzzleBounds) {
                    this.collisionManager.applyFlowWaterCollision(
                        this.getFlowWetWorldTiles(activeData.puzzle, puzzleBounds)
                    );
                }
            }

            // Update visuals (water tiles, pontoons) before the camera pan so they
            // are correct during the transition rather than only after it finishes.
            onBeforeTransition?.();

            // Return camera to overworld
            await this.cameraManager.transitionToOverworld();

            // Camera pan complete: hide the solved overlay and fully clean up the HUD
            // now that the player is back in view. Input is re-enabled right after this.
            PuzzleHUDManager.getInstance().exitPuzzle();

            // Notify view to exit puzzle mode (enables player, shows cursor, etc.)
            onModeChange('exploration');

            // Clear active puzzle
            this.gameState.clearActivePuzzle();
            this.activePuzzleController = undefined;
            this.currentPuzzleId = undefined;

            console.log('Successfully exited puzzle');

            return {
                puzzleId: activeData.id,
                wasSolved: action === 'bake',
                wasUnsolved: action === 'blank'
            };

        } catch (error) {
            console.error('Error exiting puzzle:', error);
            throw error;
        } finally {
            // Always reset the guard flag
            this.isExitingPuzzle = false;
        }
    }

    /**
     * Handle undo action from HUD
     */
    public handleUndo(): void {
        if (this.activePuzzleController) {
            this.activePuzzleController.undo();
        }
    }

    /**
     * Handle redo action from HUD
     */
    public handleRedo(): void {
        if (this.activePuzzleController) {
            this.activePuzzleController.redo();
        }
    }

    /**
     * Handle bridge type selection from HUD
     */
    public handleTypeSelected(typeId: string): void {
        if (!this.activePuzzleController) return;

        // Find the bridge type by ID
        const puzzle = this.getActivePuzzle();
        if (!puzzle) return;

        const bridgeTypes = puzzle.getAvailableBridgeTypes();
        const selectedType = bridgeTypes.find(bt => bt.id === typeId);

        if (selectedType) {
            // Update controller's selected type
            this.activePuzzleController.selectBridgeType(selectedType);

            // Notify HUD to update visual selection
            this.scene.events.emit('setSelectedType', typeId);
        }
    }

    /**
     * Handle bridge click for removal
     */
    public handleBridgeClicked(bridgeId: string): void {
        if (this.activePuzzleController) {
            this.activePuzzleController.removeBridge(bridgeId);
        }
    }

    /**
     * Check if currently in puzzle mode
     */
    public isInPuzzleMode(): boolean {
        return this.gameState.getActivePuzzle() !== null;
    }

    /**
     * Get the currently active puzzle (if any)
     */
    public getActivePuzzle(): BridgePuzzle | null {
        const activeData = this.gameState.getActivePuzzle();
        return activeData ? activeData.puzzle : null;
    }

    /**
     * Get the ID of the currently active puzzle
     */
    public getCurrentPuzzleId(): string | undefined {
        return this.currentPuzzleId;
    }

    /**
     * Create puzzle host callbacks for overworld puzzles
     */
    private createPuzzleHost(puzzleId: string): PuzzleHost {
        return {
            loadPuzzle: (_puzzleID: string) => {
                // Already loaded
            },
            onPuzzleSolved: () => {
                console.log(`Overworld puzzle ${puzzleId} solved!`);
                console.log('[DIAGNOSTIC] onPuzzleSolved callback triggered');
                // Show the solved overlay in the HUD first, then immediately begin the exit
                // sequence on the next tick. The overlay stays visible throughout the camera
                // pan and is hidden together with input being re-enabled once the pan finishes.
                this.scene.events.emit('puzzleSolved');
                setTimeout(() => {
                    console.log('[DIAGNOSTIC] Calling scene.exitOverworldPuzzle after puzzleSolved');
                    (this.scene as any).exitOverworldPuzzle(true);
                }, 0);
            },
            onPuzzleExited: (success: boolean) => {
                console.log('[DIAGNOSTIC] onPuzzleExited callback triggered, success:', success);
                // Call scene's exitOverworldPuzzle to properly clean up and restore state
                setTimeout(() => {
                    console.log('[DIAGNOSTIC] Calling scene.exitOverworldPuzzle from setTimeout');
                    (this.scene as any).exitOverworldPuzzle(success);
                }, 0);
            },
            onBridgeCountsChanged: (counts: Record<string, number>) => {
                console.log('OverworldPuzzleController: Bridge counts changed, emitting updateCounts');
                this.scene.events.emit('updateCounts', counts);
            }
        };
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        if (this.puzzleInputHandler) {
            this.puzzleInputHandler.destroy();
            this.puzzleInputHandler = undefined;
        }
        if (this.puzzleRenderer) {
            this.puzzleRenderer.destroy();
            this.puzzleRenderer = undefined;
        }
        this.activePuzzleController = undefined;
        this.currentPuzzleId = undefined;
    }
}
