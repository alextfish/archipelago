import type Phaser from 'phaser';
import type { PuzzleController } from '@controller/PuzzleController';
import type { PuzzleHUDScene } from '@view/scenes/PuzzleHUDScene';

/**
 * Singleton manager for the shared PuzzleHUD across all puzzle types
 * Handles lifecycle, visibility, and scene coordination for the unified HUD
 */
export class PuzzleHUDManager {
    private static instance: PuzzleHUDManager | null = null;
    private hudScene: PuzzleHUDScene | null = null;
    private currentController?: PuzzleController;
    private currentWorldScene?: Phaser.Scene;
    private currentPuzzleType?: 'overworld' | 'bridge';
    private isInitialized = false;

    private constructor() {
        // Private constructor for singleton
    }

    /**
     * Get the singleton instance of PuzzleHUDManager
     */
    static getInstance(): PuzzleHUDManager {
        if (!PuzzleHUDManager.instance) {
            PuzzleHUDManager.instance = new PuzzleHUDManager();
        }
        return PuzzleHUDManager.instance;
    }

    /**
     * Initialize the HUD scene once at game startup
     * Should be called from the first scene that needs puzzle functionality
     */
    initializeHUD(scene: Phaser.Scene): void {
        if (this.isInitialized) {
            console.log('PuzzleHUDManager: HUD already initialized');
            return;
        }

        console.log('PuzzleHUDManager: Initializing shared HUD');

        // Launch PuzzleHUDScene as a persistent overlay
        scene.scene.launch('PuzzleHUDScene');
        this.hudScene = scene.scene.get('PuzzleHUDScene') as PuzzleHUDScene;
        this.isInitialized = true;

        // Wait for scene to be ready, then hide it
        scene.time.delayedCall(10, () => {
            if (this.hudScene) {
                this.hudScene.setVisible(false);
                console.log('PuzzleHUDManager: HUD initialized and hidden');
            }
        });

        console.log('PuzzleHUDManager: HUD initialization started');
    }

    /**
     * Enter a puzzle mode - shows HUD and connects to controller
     */
    enterPuzzle(
        worldScene: Phaser.Scene,
        controller: PuzzleController,
        puzzleType: 'overworld' | 'bridge'
    ): void {
        if (!this.isInitialized || !this.hudScene) {
            console.error('PuzzleHUDManager: Cannot enter puzzle - HUD not initialized');
            return;
        }

        console.log(`PuzzleHUDManager: Entering ${puzzleType} puzzle mode`);

        this.currentWorldScene = worldScene;
        this.currentController = controller;
        this.currentPuzzleType = puzzleType;

        // Handle scene visibility based on puzzle type
        if (puzzleType === 'bridge') {
            // For bridge puzzles, hide the overworld scene
            // IslandMapScene will be the visible world scene
            if (worldScene.scene.isActive('OverworldScene')) {
                const overworldScene = worldScene.scene.get('OverworldScene');
                if (overworldScene) {
                    overworldScene.scene.setVisible(false);
                    console.log('PuzzleHUDManager: Hidden OverworldScene for bridge puzzle');
                }
            }
        }
        // For overworld puzzles, keep OverworldScene visible

        // Setup HUD for this puzzle
        this.hudScene.setupForPuzzle(controller, puzzleType);
        this.hudScene.setVisible(true);

        console.log('PuzzleHUDManager: HUD visible and connected to controller');
    }

    /**
     * Exit puzzle mode - hides HUD and cleans up
     */
    exitPuzzle(): void {
        if (!this.hudScene) {
            console.warn('PuzzleHUDManager: Cannot exit puzzle - HUD not initialized');
            return;
        }

        console.log(`PuzzleHUDManager: Exiting ${this.currentPuzzleType || 'unknown'} puzzle mode`);

        // Restore overworld visibility if we hid it
        if (this.currentPuzzleType === 'bridge' && this.currentWorldScene) {
            const overworldScene = this.currentWorldScene.scene.get('OverworldScene');
            if (overworldScene) {
                overworldScene.scene.setVisible(true);
                console.log('PuzzleHUDManager: Restored OverworldScene visibility');
            }
        }

        // Hide and cleanup HUD
        this.hudScene.setVisible(false);
        this.hudScene.cleanup();

        // Clear references
        this.currentController = undefined;
        this.currentWorldScene = undefined;
        this.currentPuzzleType = undefined;

        console.log('PuzzleHUDManager: HUD hidden and cleaned up');
    }

    /**
     * Check if currently in a puzzle
     */
    isInPuzzle(): boolean {
        return this.currentController !== undefined;
    }

    /**
     * Get the current puzzle type
     */
    getCurrentPuzzleType(): 'overworld' | 'bridge' | undefined {
        return this.currentPuzzleType;
    }

    /**
     * Check if HUD is initialized
     */
    isHUDInitialized(): boolean {
        return this.isInitialized;
    }

    /**
     * Reset the manager (for testing or game restart)
     */
    reset(): void {
        console.log('PuzzleHUDManager: Resetting manager');

        if (this.hudScene) {
            this.hudScene.setVisible(false);
            this.hudScene.cleanup();
        }

        this.hudScene = null;
        this.currentController = undefined;
        this.currentWorldScene = undefined;
        this.currentPuzzleType = undefined;
        this.isInitialized = false;
    }
}
