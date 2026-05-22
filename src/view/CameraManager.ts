import Phaser from 'phaser';
import type { ActiveOverworldCameraTarget, CameraZoneBounds } from '@model/overworld/OverworldCameraZones';

// Margin around puzzle in grid cells when zooming to fit
const PUZZLE_VIEW_MARGIN_CELLS = 2;
const DEFAULT_FOLLOW_ZOOM = 2;

/**
 * Manages camera transitions for overworld puzzle integration
 * Handles smooth transitions between overworld view and puzzle-focused view
 */
export class CameraManager {
    static readonly SCOPE_TRANSITION_DURATION_MS = 1500;
    static readonly FOLLOW_ZOOM_TRANSITION_DURATION_MS = 1200;

    private scene: Phaser.Scene;
    private originalBounds: Phaser.Geom.Rectangle | null = null;
    private originalZoom: number = 1;
    private originalX: number = 0;
    private originalY: number = 0;
    private originalCenterX: number = 0;
    private originalCenterY: number = 0;
    private readonly tileSize: number;
    private readonly defaultFollowZoom: number;
    private explorationTween?: Phaser.Tweens.Tween;
    private explorationZoomTween?: Phaser.Tweens.Tween;
    private isInScopedOverworldView: boolean = false;
    private activeOverworldTargetKey: string | null = null;

    constructor(scene: Phaser.Scene, tileSize: number = 32, defaultFollowZoom: number = DEFAULT_FOLLOW_ZOOM) {
        this.scene = scene;
        this.tileSize = tileSize;
        this.defaultFollowZoom = defaultFollowZoom;
    }

    getDefaultFollowZoom(): number {
        return this.defaultFollowZoom;
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
        this.originalCenterX = camera.scrollX + (camera.width / 2);
        this.originalCenterY = camera.scrollY + (camera.height / 2);

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

        // Run the pan + zoom animations and wait for both to reach their end.
        // camera.pan() tracks the world centre dynamically each frame as zoom
        // changes, so it correctly centres on the target point even while
        // zoomTo() is animating simultaneously.  The promise resolves when the
        // pan effect fires its completion callback (progress === 1).
        await new Promise<void>((resolve) => {
            camera.pan(centerX, centerY, duration, 'Power2', false, (_camera, progress) => {
                if (progress === 1) {
                    resolve();
                }
            });

            // Zoom to fit puzzle
            camera.zoomTo(targetZoom, duration, 'Power2');
        });

        // Snap to the exact final position.  In low-frame-rate environments
        // (e.g. headless CI) the pan effect's final update can run before the
        // zoom effect has committed the target zoom for that frame, leaving
        // scrollX/scrollY slightly off.  Setting zoom and centreOn() explicitly
        // here guarantees the camera lands exactly where we need it.
        camera.setZoom(targetZoom);
        camera.centerOn(centerX, centerY);
        console.log(`CameraManager: Snapped camera to (${centerX}, ${centerY}) zoom=${camera.zoom} scroll=(${camera.scrollX.toFixed(0)}, ${camera.scrollY.toFixed(0)})`);
    }

    /**
     * Return camera to original overworld view.
     * Tweens scrollX/scrollY directly to the stored position (independent of
     * current zoom) while simultaneously restoring the zoom level.
     * Note: The caller should resume camera follow after this completes.
     */
    async transitionToOverworld(duration: number = 1000): Promise<void> {
        if (!this.originalBounds) {
            console.warn('No original camera bounds stored');
            return;
        }

        const camera = this.scene.cameras.main;

        console.log(`CameraManager: Returning to overworld at zoom ${this.originalZoom}, centre (${this.originalCenterX}, ${this.originalCenterY})`);

        return new Promise<void>((resolve) => {
            // Tween scrollX/scrollY directly rather than using camera.pan().
            // camera.pan() bakes its target scroll using the zoom at call-time, so
            // calling it while the zoom is still at the (potentially very different)
            // puzzle zoom would land at the wrong position.  Direct scroll tweening
            // is zoom-independent and always arrives at exactly the stored position.
            this.scene.tweens.add({
                targets: camera,
                scrollX: this.originalX,
                scrollY: this.originalY,
                duration,
                ease: 'Power2',
                onComplete: () => resolve()
            });
            camera.zoomTo(this.originalZoom, duration, 'Power2');
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

    applyOverworldTarget(
        player: Phaser.GameObjects.Sprite,
        target: ActiveOverworldCameraTarget,
        options: { immediate?: boolean; force?: boolean } = {}
    ): void {
        const { immediate = false, force = false } = options;
        const wasInScopedOverworldView = this.isInScopedOverworldView;
        if (!force && this.activeOverworldTargetKey === target.key) {
            return;
        }

        this.activeOverworldTargetKey = target.key;

        if (target.mode === 'scope' && target.focusBounds) {
            if (immediate) {
                this.setFixedBoundsView(target.focusBounds);
            } else {
                this.tweenToFixedBoundsView(target.focusBounds, CameraManager.SCOPE_TRANSITION_DURATION_MS);
            }
            this.isInScopedOverworldView = true;
            return;
        }

        this.isInScopedOverworldView = false;
        if (immediate) {
            this.setFollowView(player, target.followZoom);
            return;
        }

        if (force || wasInScopedOverworldView) {
            this.tweenToFollowView(player, target.followZoom, CameraManager.SCOPE_TRANSITION_DURATION_MS);
            return;
        }

        this.tweenFollowZoom(target.followZoom, CameraManager.FOLLOW_ZOOM_TRANSITION_DURATION_MS);
    }

    /**
     * Smoothly pan the camera to a specific world position and back to a target
     * object, temporarily stopping camera follow for the duration.
     *
     * Player movement is disabled by the caller (DoorManager) before this is
     * called; the caller is also responsible for re-enabling it afterwards.
     *
     * @param worldX        Target world X to pan to.
     * @param worldY        Target world Y to pan to.
     * @param returnTarget  The object to pan back to once the callback completes
     *                      (typically the player sprite).
     * @param duration      Duration of each pan leg in milliseconds.
     * @param onAtTarget    Async callback invoked once the camera has arrived at
     *                      (worldX, worldY).  Awaited before panning back.
     */
    async panToWorldPositionAndBack(
        worldX: number,
        worldY: number,
        returnTarget: { x: number; y: number },
        duration: number,
        onAtTarget: () => Promise<void>
    ): Promise<void> {
        const camera = this.scene.cameras.main;
        camera.stopFollow();

        try {
            await new Promise<void>((resolve) => {
                camera.pan(worldX, worldY, duration, 'Power2', false, (_cam, progress) => {
                    if (progress === 1) resolve();
                });
            });

            await onAtTarget();

        } finally {
            await new Promise<void>((resolve) => {
                camera.pan(returnTarget.x, returnTarget.y, duration, 'Power2', false, (_cam, progress) => {
                    if (progress === 1) resolve();
                });
            });
            camera.startFollow(returnTarget as unknown as Phaser.GameObjects.GameObject);
        }
    }

    private setFixedBoundsView(bounds: CameraZoneBounds): void {
        const camera = this.scene.cameras.main;
        const { centerX, centerY, targetZoom } = this.calculateBoundsFit(bounds);
        this.stopOverworldTweens();
        camera.stopFollow();
        camera.setZoom(targetZoom);
        camera.centerOn(centerX, centerY);
    }

    private setFollowView(player: Phaser.GameObjects.Sprite, zoom: number): void {
        const camera = this.scene.cameras.main;
        this.stopOverworldTweens();
        camera.stopFollow();
        camera.setZoom(zoom);
        camera.centerOn(player.x, player.y);
        camera.startFollow(player);
    }

    private tweenToFixedBoundsView(bounds: CameraZoneBounds, duration: number): void {
        const camera = this.scene.cameras.main;
        const { centerX, centerY, targetZoom } = this.calculateBoundsFit(bounds);
        this.stopOverworldTweens();
        const proxy = this.createCameraTweenProxy();
        camera.stopFollow();
        this.explorationTween = this.scene.tweens.add({
            targets: proxy,
            centerX,
            centerY,
            zoom: targetZoom,
            duration,
            ease: 'Power2',
            onUpdate: () => {
                camera.setZoom(proxy.zoom);
                camera.centerOn(proxy.centerX, proxy.centerY);
            },
            onComplete: () => {
                camera.setZoom(targetZoom);
                camera.centerOn(centerX, centerY);
                this.explorationTween = undefined;
            }
        });
    }

    private tweenToFollowView(player: Phaser.GameObjects.Sprite, zoom: number, duration: number): void {
        const camera = this.scene.cameras.main;
        this.stopOverworldTweens();
        const startView = this.createCameraTweenProxy();
        const proxy = {
            progress: 0,
            zoom: camera.zoom
        };
        camera.stopFollow();
        this.explorationTween = this.scene.tweens.add({
            targets: proxy,
            progress: 1,
            zoom,
            duration,
            ease: 'Power2',
            onUpdate: () => {
                const dynamicCenterX = startView.centerX + ((player.x - startView.centerX) * proxy.progress);
                const dynamicCenterY = startView.centerY + ((player.y - startView.centerY) * proxy.progress);
                camera.setZoom(proxy.zoom);
                camera.centerOn(dynamicCenterX, dynamicCenterY);
            },
            onComplete: () => {
                camera.setZoom(zoom);
                camera.centerOn(player.x, player.y);
                camera.startFollow(player);
                this.explorationTween = undefined;
            }
        });
    }

    private tweenFollowZoom(zoom: number, duration: number): void {
        const camera = this.scene.cameras.main;
        this.explorationZoomTween?.stop();
        const proxy = { zoom: camera.zoom };
        this.explorationZoomTween = this.scene.tweens.add({
            targets: proxy,
            zoom,
            duration,
            ease: 'Power2',
            onUpdate: () => {
                camera.setZoom(proxy.zoom);
            },
            onComplete: () => {
                camera.setZoom(zoom);
                this.explorationZoomTween = undefined;
            }
        });
    }

    private calculateBoundsFit(bounds: CameraZoneBounds): { centerX: number; centerY: number; targetZoom: number } {
        const camera = this.scene.cameras.main;
        return {
            centerX: bounds.x + bounds.width / 2,
            centerY: bounds.y + bounds.height / 2,
            targetZoom: Math.min(camera.width / bounds.width, camera.height / bounds.height)
        };
    }

    private createCameraTweenProxy(): { centerX: number; centerY: number; zoom: number } {
        const camera = this.scene.cameras.main;
        return {
            centerX: camera.scrollX + (camera.width / 2),
            centerY: camera.scrollY + (camera.height / 2),
            zoom: camera.zoom
        };
    }

    private stopOverworldTweens(): void {
        this.explorationTween?.stop();
        this.explorationTween = undefined;
        this.explorationZoomTween?.stop();
        this.explorationZoomTween = undefined;
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
        this.isInScopedOverworldView = false;
        this.activeOverworldTargetKey = null;
        this.stopOverworldTweens();
    }
}