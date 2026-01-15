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
    private originalCenterX: number = 0;
    private originalCenterY: number = 0;
    private readonly tileSize: number;

    constructor(scene: Phaser.Scene, tileSize: number = 32) {
        this.scene = scene;
        this.tileSize = tileSize;
    }

    /**
     * Calculate and store the current camera state before transitioning
     * Should be called BEFORE stopping camera follow to capture the follow position
     */
    storeCameraState(): void {
        const camera = this.scene.cameras.main;

        // Store original camera state
        // Use width/height (viewport size) not displayWidth/displayHeight (affected by zoom)
        this.originalBounds = new Phaser.Geom.Rectangle(
            camera.scrollX,
            camera.scrollY,
            camera.width / camera.zoom,  // World space width at current zoom
            camera.height / camera.zoom   // World space height at current zoom
        );
        this.originalZoom = camera.zoom;
        this.originalX = camera.scrollX;
        this.originalY = camera.scrollY;
        // Store the center point of the current view in world coordinates
        this.originalCenterX = camera.scrollX + (camera.width / camera.zoom) / 2;
        this.originalCenterY = camera.scrollY + (camera.height / camera.zoom) / 2;

        console.log(`CameraManager: Stored camera state - scroll(${camera.scrollX}, ${camera.scrollY}) zoom=${camera.zoom}`);
        console.log(`  Calculated center: (${this.originalCenterX}, ${this.originalCenterY})`);
    }

    /**
     * Calculate the target view for a puzzle (with padding)
     */
    private calculatePuzzleView(puzzleBounds: Phaser.Geom.Rectangle): {
        centerX: number;
        centerY: number;
        targetZoom: number;
        paddedBounds: Phaser.Geom.Rectangle;
    } {
        const camera = this.scene.cameras.main;
        const padding = PUZZLE_VIEW_MARGIN_CELLS * this.tileSize;

        // Calculate puzzle bounds with padding
        const paddedBounds = new Phaser.Geom.Rectangle(
            puzzleBounds.x - padding,
            puzzleBounds.y - padding,
            puzzleBounds.width + padding * 2,
            puzzleBounds.height + padding * 2
        );

        // Calculate zoom to fit puzzle with padding
        const scaleX = camera.width / paddedBounds.width;
        const scaleY = camera.height / paddedBounds.height;
        const targetZoom = Math.min(scaleX, scaleY);

        // Calculate center point
        const centerX = paddedBounds.x + paddedBounds.width / 2;
        const centerY = paddedBounds.y + paddedBounds.height / 2;

        return { centerX, centerY, targetZoom, paddedBounds };
    }

    /**
     * Transition camera to focus on a puzzle area
     * Note: Call storeCameraState() before this if you need to preserve the camera position
     * @param puzzleBounds The puzzle bounds in pixels
     * @param duration Animation duration in milliseconds
     */
    async transitionToPuzzle(
        puzzleBounds: Phaser.Geom.Rectangle,
        duration: number = 1000
    ): Promise<void> {
        const camera = this.scene.cameras.main;

        // Calculate target view
        const { centerX, centerY, targetZoom, paddedBounds } = this.calculatePuzzleView(puzzleBounds);

        console.log(`CameraManager: Transitioning to puzzle at (${centerX}, ${centerY}) with zoom ${targetZoom} (padding: ${PUZZLE_VIEW_MARGIN_CELLS * this.tileSize}px = ${PUZZLE_VIEW_MARGIN_CELLS} cells)`);
        console.log(`  Puzzle bounds: ${puzzleBounds.width}x${puzzleBounds.height}, with padding: ${paddedBounds.width}x${paddedBounds.height}`);
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
     * Note: The caller should resume camera follow after this completes
     */
    async transitionToOverworld(duration: number = 1000): Promise<void> {
        if (!this.originalBounds) {
            console.warn('No original camera bounds stored');
            return;
        }

        const camera = this.scene.cameras.main;

        console.log(`CameraManager: Returning to overworld at zoom ${this.originalZoom}`);

        return new Promise<void>((resolve) => {
            // Just zoom back - the caller will resume camera follow which will handle positioning
            camera.zoomTo(this.originalZoom, duration, 'Power2', false, (_camera, progress) => {
                if (progress === 1) {
                    resolve();
                }
            });
        });
    }

    /**
     * Immediately set camera to puzzle view (no animation)
     * Note: Call storeCameraState() before this if you need to preserve the camera position
     */
    setPuzzleView(puzzleBounds: Phaser.Geom.Rectangle): void {
        const camera = this.scene.cameras.main;

        // Calculate target view
        const { centerX, centerY, targetZoom } = this.calculatePuzzleView(puzzleBounds);

        // Immediately set the view
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
        this.originalCenterX = 0;
        this.originalCenterY = 0;
    }
}