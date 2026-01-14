import Phaser from 'phaser';

// Margin around puzzle in grid cells when zooming to fit
const PUZZLE_VIEW_MARGIN_CELLS = 2;

/**
 * Manages camera transitions for overworld puzzle integration
 * Handles smooth transitions between overworld view and puzzle-focused view
 */
export class CameraManager {
    private scene: Phaser.Scene;
    private originalBounds: Phaser.Geom.Rectangle | null = null;
    private originalZoom: number = 1;
    private originalX: number = 0;
    private originalY: number = 0;
    private readonly tileSize: number;

    constructor(scene: Phaser.Scene, tileSize: number = 32) {
        this.scene = scene;
        this.tileSize = tileSize;
    }

    /**
     * Transition camera to focus on a puzzle area
     * @param puzzleBounds The puzzle bounds in pixels
     * @param duration Animation duration in milliseconds
     */
    async transitionToPuzzle(
        puzzleBounds: Phaser.Geom.Rectangle,
        duration: number = 1000
    ): Promise<void> {
        const camera = this.scene.cameras.main;

        // Calculate padding in pixels (PUZZLE_VIEW_MARGIN_CELLS * tileSize)
        const padding = PUZZLE_VIEW_MARGIN_CELLS * this.tileSize;

        // Store original camera state
        this.originalBounds = new Phaser.Geom.Rectangle(
            camera.scrollX,
            camera.scrollY,
            camera.displayWidth,
            camera.displayHeight
        );
        this.originalZoom = camera.zoom;
        this.originalX = camera.scrollX;
        this.originalY = camera.scrollY;

        // Calculate target camera position and zoom
        const puzzleWithPadding = new Phaser.Geom.Rectangle(
            puzzleBounds.x - padding,
            puzzleBounds.y - padding,
            puzzleBounds.width + padding * 2,
            puzzleBounds.height + padding * 2
        );

        // Calculate zoom to fit puzzle with padding
        // Use width/height (viewport size) not displayWidth/displayHeight (which are affected by zoom)
        const scaleX = camera.width / puzzleWithPadding.width;
        const scaleY = camera.height / puzzleWithPadding.height;
        const targetZoom = Math.min(scaleX, scaleY); // No max cap - zoom as needed to fit

        // Calculate center point
        const centerX = puzzleWithPadding.x + puzzleWithPadding.width / 2;
        const centerY = puzzleWithPadding.y + puzzleWithPadding.height / 2;

        console.log(`CameraManager: Transitioning to puzzle at (${centerX}, ${centerY}) with zoom ${targetZoom} (padding: ${padding}px = ${PUZZLE_VIEW_MARGIN_CELLS} cells)`);
        console.log(`  Puzzle bounds: ${puzzleBounds.width}x${puzzleBounds.height}, with padding: ${puzzleWithPadding.width}x${puzzleWithPadding.height}`);
        console.log(`  Camera viewport: ${camera.width}x${camera.height}, current zoom: ${camera.zoom}`);


        // Create transition promise
        return new Promise<void>((resolve) => {
            // Pan to center of puzzle
            camera.pan(centerX, centerY, duration, 'Power2', false, (_camera, progress) => {
                if (progress === 1) {
                    resolve();
                }
            });

            // Zoom to fit puzzle
            camera.zoomTo(targetZoom, duration, 'Power2');
        });
    }

    /**
     * Return camera to original overworld view
     */
    async transitionToOverworld(duration: number = 1000): Promise<void> {
        if (!this.originalBounds) {
            console.warn('No original camera bounds stored');
            return;
        }

        const camera = this.scene.cameras.main;

        console.log(`CameraManager: Returning to overworld at zoom ${this.originalZoom}`);

        return new Promise<void>((resolve) => {
            // Return to original position
            camera.pan(
                this.originalX + this.originalBounds!.width / 2,
                this.originalY + this.originalBounds!.height / 2,
                duration,
                'Power2',
                false,
                (_camera, progress) => {
                    if (progress === 1) {
                        resolve();
                    }
                }
            );

            // Return to original zoom
            camera.zoomTo(this.originalZoom, duration, 'Power2');
        });
    }

    /**
     * Immediately set camera to puzzle view (no animation)
     */
    setPuzzleView(puzzleBounds: Phaser.Geom.Rectangle): void {
        const camera = this.scene.cameras.main;

        // Calculate padding in pixels
        const padding = PUZZLE_VIEW_MARGIN_CELLS * this.tileSize;

        // Store original state
        this.originalBounds = new Phaser.Geom.Rectangle(
            camera.scrollX,
            camera.scrollY,
            camera.displayWidth,
            camera.displayHeight
        );
        this.originalX = camera.scrollX;
        this.originalY = camera.scrollY;
        this.originalZoom = camera.zoom;

        // Calculate target view
        const puzzleWithPadding = new Phaser.Geom.Rectangle(
            puzzleBounds.x - padding,
            puzzleBounds.y - padding,
            puzzleBounds.width + padding * 2,
            puzzleBounds.height + padding * 2
        );

        const scaleX = camera.width / puzzleWithPadding.width;
        const scaleY = camera.height / puzzleWithPadding.height;
        const targetZoom = Math.min(scaleX, scaleY); // No max cap

        const centerX = puzzleWithPadding.x + puzzleWithPadding.width / 2;
        const centerY = puzzleWithPadding.y + puzzleWithPadding.height / 2;

        camera.setZoom(targetZoom);
        camera.centerOn(centerX, centerY);
    }

    /**
     * Immediately return to overworld view (no animation)
     */
    setOverworldView(): void {
        if (!this.originalBounds) {
            return;
        }

        const camera = this.scene.cameras.main;
        camera.setZoom(this.originalZoom);
        camera.setScroll(this.originalX, this.originalY);
    }

    /**
     * Check if currently in puzzle view mode
     */
    isInPuzzleView(): boolean {
        return this.originalBounds !== null;
    }

    /**
     * Clear stored state
     */
    reset(): void {
        this.originalBounds = null;
        this.originalZoom = 1;
        this.originalX = 0;
        this.originalY = 0;
    }
}