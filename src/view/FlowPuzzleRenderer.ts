import Phaser from 'phaser';
import { EmbeddedPuzzleRenderer } from './EmbeddedPuzzleRenderer';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import type { FlowSquareSpec, WaterChangeWaves } from '@model/puzzle/FlowTypes';

/**
 * Extends EmbeddedPuzzleRenderer with FlowPuzzle-specific rendering.
 *
 * Water tiles are represented as coloured overlays for now; switching to sprites
 * only requires changing createTileOverlay() and setTileState() — everything
 * else (wave timing, animation scheduling) is independent of the visual type.
 */
export class FlowPuzzleRenderer extends EmbeddedPuzzleRenderer {
    private flowPuzzle: FlowPuzzle | null = null;
    private waterOverlays: Map<string, Phaser.GameObjects.Rectangle> = new Map();
    private pendingTimers: Phaser.Time.TimerEvent[] = [];

    // Colours for water tile states — change here when switching to sprites
    private static readonly COLOUR_WATER = 0x3399ff;
    private static readonly COLOUR_DRY = 0x8b6914;
    private static readonly ALPHA_OVERLAY = 0.50;
    private static readonly WAVE_DELAY_MS = 120;

    // -------------------------------------------------------------------------
    // Overrides
    // -------------------------------------------------------------------------

    override init(puzzle: BridgePuzzle): void {
        this.destroyFlowOverlays();
        super.init(puzzle);

        if (puzzle instanceof FlowPuzzle) {
            this.flowPuzzle = puzzle;
            this.initFlowOverlays(puzzle);
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
        this.destroyFlowOverlays();
        super.destroy();
    }

    // -------------------------------------------------------------------------
    // Visual abstraction — only these two methods touch Phaser game objects.
    // Replace with sprite logic here when the time comes.
    // -------------------------------------------------------------------------

    private createTileOverlay(key: string, sq: FlowSquareSpec, hasWater: boolean): void {
        const worldPos = this.gridMapper.gridToWorld(sq.x, sq.y);
        const cellSize = this.gridMapper.getCellSize();
        const rect = this.scene.add.rectangle(
            worldPos.x, worldPos.y,
            cellSize, cellSize,
            hasWater ? FlowPuzzleRenderer.COLOUR_WATER : FlowPuzzleRenderer.COLOUR_DRY,
            FlowPuzzleRenderer.ALPHA_OVERLAY
        );
        rect.setOrigin(0, 0);
        rect.setDepth(99); // Below island/bridge graphics (depth 100)
        this.puzzleContainer.add(rect);
        this.waterOverlays.set(key, rect);
    }

    private setTileState(key: string, hasWater: boolean): void {
        this.waterOverlays.get(key)?.setFillStyle(
            hasWater ? FlowPuzzleRenderer.COLOUR_WATER : FlowPuzzleRenderer.COLOUR_DRY,
            FlowPuzzleRenderer.ALPHA_OVERLAY
        );
    }

    // -------------------------------------------------------------------------
    // Animation
    // -------------------------------------------------------------------------

    /**
     * Play a sequence of water-change waves with a fixed delay between each.
     * Each wave instantly flips its tiles; only the TIMING is staggered.
     *
     * By the time this is called the puzzle is already in the final state, so
     * we first reset all affected tiles to their PRE-change colour, then flip
     * them forward wave-by-wave.
     *
     * flooding=false → drying:  tiles start WATER-coloured, flip to DRY
     * flooding=true  → flooding: tiles start DRY-coloured,   flip to WATER
     */
    private playWavesSequentially(waves: WaterChangeWaves, flooding: boolean): void {
        this.cancelPendingAnimation();

        const preState = !flooding; // drying: tiles were wet; flooding: tiles were dry
        const postState = flooding; // drying: tiles become dry; flooding: tiles become wet

        // Reset all affected tiles to their pre-change colour
        for (const wave of waves) {
            for (const cell of wave) {
                this.setTileState(`${cell.x},${cell.y}`, preState);
            }
        }

        // Flip each wave to post-change colour after its delay
        waves.forEach((wave, index) => {
            const timer = this.scene.time.delayedCall(
                index * FlowPuzzleRenderer.WAVE_DELAY_MS,
                () => {
                    for (const cell of wave) {
                        this.setTileState(`${cell.x},${cell.y}`, postState);
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

    private initFlowOverlays(puzzle: FlowPuzzle): void {
        for (const sq of this.allFlowSquares(puzzle)) {
            const key = `${sq.x},${sq.y}`;
            const hasWater = puzzle.tileHasWater(sq.x, sq.y);
            this.createTileOverlay(key, sq, hasWater);
        }
    }

    private snapToCurrentState(): void {
        this.cancelPendingAnimation();
        if (!this.flowPuzzle) return;
        for (const [key] of this.waterOverlays) {
            const [x, y] = key.split(',').map(Number);
            this.setTileState(key, this.flowPuzzle.tileHasWater(x, y));
        }
    }

    private destroyFlowOverlays(): void {
        this.cancelPendingAnimation();
        for (const rect of this.waterOverlays.values()) rect.destroy();
        this.waterOverlays.clear();
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




