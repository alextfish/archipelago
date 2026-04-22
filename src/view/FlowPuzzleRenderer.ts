import Phaser from 'phaser';
import { EmbeddedPuzzleRenderer } from './EmbeddedPuzzleRenderer';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import type { FlowSquareSpec, WaterChangeWaves } from '@model/puzzle/FlowTypes';

/**
 * Extends EmbeddedPuzzleRenderer with FlowPuzzle-specific rendering.
 *
 * Rather than drawing coloured rectangle overlays, water state is communicated
 * through a `tileVisualCallback` supplied by OverworldScene.  The callback
 * manipulates the actual Tiled water/pontoon layers directly so the map tiles
 * are the source of truth for both puzzle-solving and overworld views.
 *
 * Wave animation still staggers tile changes across time; only the mechanism
 * for each individual tile change has changed.
 */
export class FlowPuzzleRenderer extends EmbeddedPuzzleRenderer {
    private flowPuzzle: FlowPuzzle | null = null;
    private pendingTimers: Phaser.Time.TimerEvent[] = [];

    /** Called whenever a flow tile's water state should change visually.
     *  Supplied by OverworldScene so this renderer stays decoupled from Tiled logic. */
    private tileVisualCallback?: (lx: number, ly: number, hasWater: boolean) => void;

    private static readonly WAVE_DELAY_MS = 120;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Inject the callback that drives actual Tiled tile visuals per flow square. */
    setTileVisualCallback(cb: (lx: number, ly: number, hasWater: boolean) => void): void {
        this.tileVisualCallback = cb;
    }

    /**
     * Returns a Promise that resolves once all pending wave-animation timers have
     * fired, capped at `maxMs` milliseconds.  If there are no pending timers the
     * Promise resolves immediately.
     *
     * This lets callers (e.g. OverworldPuzzleController) wait for the visual
     * propagation to finish before destroying the renderer, rather than cancelling
     * the animation prematurely.
     */
    waitForAnimation(maxMs: number = 2000): Promise<void> {
        if (this.pendingTimers.length === 0) {
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            let remaining = this.pendingTimers.length;
            const onTimerComplete = () => {
                remaining--;
                if (remaining <= 0) resolve();
            };

            // Attach a completion callback to each pending timer.
            // Phaser.Time.TimerEvent does not natively support chaining, so we
            // wrap each callback by replacing its `callback` property while
            // preserving the original fire.
            for (const timer of this.pendingTimers) {
                const original = timer.callback;
                const scope = timer.callbackScope;
                timer.callback = (...args: unknown[]) => {
                    original.call(scope, ...args);
                    onTimerComplete();
                };
            }

            // Safety cap: resolve after maxMs even if some timers were removed.
            this.scene.time.delayedCall(maxMs, resolve);
        });
    }

    // -------------------------------------------------------------------------
    // Overrides
    // -------------------------------------------------------------------------

    override init(puzzle: BridgePuzzle): void {
        super.init(puzzle);

        if (puzzle instanceof FlowPuzzle) {
            this.flowPuzzle = puzzle;
            // Immediately drive Tiled tiles to the puzzle's current water state
            this.syncVisuals(puzzle);
            // Consume any pending change accumulated during construction
            puzzle.consumePendingWaterChange();
        }
    }

    override updateFromPuzzle(puzzle: BridgePuzzle): void {
        super.updateFromPuzzle(puzzle);

        if (!(puzzle instanceof FlowPuzzle)) return;
        this.flowPuzzle = puzzle;

        const pending = puzzle.consumePendingWaterChange();
        if (pending && pending.waves.length > 0) {
            this.playWavesSequentially(pending.waves, pending.flooding);
        } else {
            this.snapToCurrentState();
        }
    }

    override destroy(): void {
        this.cancelPendingAnimation();
        super.destroy();
    }

    // -------------------------------------------------------------------------
    // Animation
    // -------------------------------------------------------------------------

    /**
     * Play a sequence of water-change waves with a fixed delay between each.
     * Each wave instantly flips its tiles; only the TIMING is staggered.
     *
     * By the time this is called the puzzle is already in the final state, so
     * we first reset all affected tiles to their PRE-change visual, then flip
     * them forward wave-by-wave via tileVisualCallback.
     *
     * flooding=false → drying:   tiles start wet, flip to dry
     * flooding=true  → flooding:  tiles start dry, flip to wet
     */
    private playWavesSequentially(waves: WaterChangeWaves, flooding: boolean): void {
        this.cancelPendingAnimation();

        const preState = !flooding;
        const postState = flooding;

        // Reset all affected tiles to their pre-change visual state
        for (const wave of waves) {
            for (const cell of wave) {
                this.tileVisualCallback?.(cell.x, cell.y, preState);
            }
        }

        // Flip each wave to post-change state after its delay
        waves.forEach((wave, index) => {
            const timer = this.scene.time.delayedCall(
                index * FlowPuzzleRenderer.WAVE_DELAY_MS,
                () => {
                    for (const cell of wave) {
                        this.tileVisualCallback?.(cell.x, cell.y, postState);
                    }
                }
            );
            this.pendingTimers.push(timer);
        });
    }

    private cancelPendingAnimation(): void {
        for (const timer of this.pendingTimers) timer.remove();
        this.pendingTimers = [];
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Drive all flow tiles to match the puzzle's current water state immediately. */
    private syncVisuals(puzzle: FlowPuzzle): void {
        for (const sq of this.allFlowSquares(puzzle)) {
            this.tileVisualCallback?.(sq.x, sq.y, puzzle.tileHasWater(sq.x, sq.y));
        }
    }

    private snapToCurrentState(): void {
        this.cancelPendingAnimation();
        if (!this.flowPuzzle) return;
        this.syncVisuals(this.flowPuzzle);
    }

    private allFlowSquares(puzzle: FlowPuzzle): FlowSquareSpec[] {
        const squares: FlowSquareSpec[] = [];
        for (const key of puzzle.getHasWaterGrid().keys()) {
            const [x, y] = (key as string).split(',').map(Number);
            const sq = puzzle.getFlowSquare(x, y);
            if (sq) squares.push(sq);
        }
        return squares;
    }
}




