import Phaser from 'phaser';
import { EmbeddedPuzzleRenderer } from './EmbeddedPuzzleRenderer';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import type { FlowSquareSpec } from '@model/puzzle/FlowTypes';
import type { WaterChangeWaves } from '@model/puzzle/FlowTypes';

/**
 * Extends EmbeddedPuzzleRenderer with FlowPuzzle-specific rendering:
 * coloured water tile overlays that respond to the puzzle's water state.
 */
export class FlowPuzzleRenderer extends EmbeddedPuzzleRenderer {
    private flowPuzzle: FlowPuzzle | null = null;
    private waterOverlays: Map<string, Phaser.GameObjects.Rectangle> = new Map();

    // Colours for water tile states
    private static readonly COLOUR_WATER = 0x3399ff;
    private static readonly COLOUR_DRY = 0x8b6914;
    private static readonly ALPHA_OVERLAY = 0.50;

    override init(puzzle: BridgePuzzle): void {
        super.init(puzzle);

        if (puzzle instanceof FlowPuzzle) {
            this.flowPuzzle = puzzle;
            this.initFlowOverlays(puzzle);
        }
    }

    override updateFromPuzzle(puzzle: BridgePuzzle): void {
        super.updateFromPuzzle(puzzle);

        if (this.flowPuzzle) {
            this.snapWaterTilesToCurrentState();
        }
    }

    /**
     * Animate cells drying up wave by wave after a bridge is placed.
     * Called by the controller after executing a bridge placement.
     */
    animateDryingWaves(waves: WaterChangeWaves): void {
        this.playWavesSequentially(waves, false);
    }

    /**
     * Animate cells gaining water wave by wave after a bridge is removed.
     * Called by the controller after executing a bridge removal.
     */
    animateFloodingWaves(waves: WaterChangeWaves): void {
        this.playWavesSequentially(waves, true);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private initFlowOverlays(puzzle: FlowPuzzle): void {
        this.destroyFlowOverlays();

        for (const sq of this.allFlowSquares(puzzle)) {
            const key = `${sq.x},${sq.y}`;
            const worldPos = this.gridMapper.gridToWorld(sq.x, sq.y);
            const cellSize = this.gridMapper.getCellSize();
            const hasWater = puzzle.tileHasWater(sq.x, sq.y);

            const rect = this.scene.add.rectangle(
                worldPos.x,
                worldPos.y,
                cellSize,
                cellSize,
                hasWater ? FlowPuzzleRenderer.COLOUR_WATER : FlowPuzzleRenderer.COLOUR_DRY,
                FlowPuzzleRenderer.ALPHA_OVERLAY
            );
            rect.setOrigin(0, 0);
            rect.setDepth(99); // Below island/bridge graphics (depth 100)

            this.puzzleContainer.add(rect);
            this.waterOverlays.set(key, rect);
        }
    }

    private snapWaterTilesToCurrentState(): void {
        if (!this.flowPuzzle) return;

        for (const [key, rect] of this.waterOverlays) {
            const [x, y] = key.split(',').map(Number);
            const hasWater = this.flowPuzzle.tileHasWater(x, y);
            rect.setFillStyle(
                hasWater ? FlowPuzzleRenderer.COLOUR_WATER : FlowPuzzleRenderer.COLOUR_DRY,
                FlowPuzzleRenderer.ALPHA_OVERLAY
            );
        }
    }

    private playWavesSequentially(waves: WaterChangeWaves, flooding: boolean): void {
        if (waves.length === 0) {
            this.snapWaterTilesToCurrentState();
            return;
        }

        const WAVE_DELAY_MS = 120;
        const targetColour = flooding
            ? FlowPuzzleRenderer.COLOUR_WATER
            : FlowPuzzleRenderer.COLOUR_DRY;

        waves.forEach((wave, index) => {
            this.scene.time.delayedCall(index * WAVE_DELAY_MS, () => {
                for (const cell of wave) {
                    const key = `${cell.x},${cell.y}`;
                    const rect = this.waterOverlays.get(key);
                    if (!rect) continue;

                    this.scene.tweens.add({
                        targets: rect,
                        duration: 80,
                        ease: 'Sine.easeInOut',
                        onStart: () => rect.setFillStyle(targetColour, FlowPuzzleRenderer.ALPHA_OVERLAY),
                    });
                }
            });
        });
    }

    private destroyFlowOverlays(): void {
        for (const rect of this.waterOverlays.values()) {
            rect.destroy();
        }
        this.waterOverlays.clear();
    }

    private allFlowSquares(puzzle: FlowPuzzle): FlowSquareSpec[] {
        const squares: FlowSquareSpec[] = [];
        const grid = puzzle.getHasWaterGrid();
        for (const key of grid.keys()) {
            const [x, y] = (key as string).split(',').map(Number);
            const sq = puzzle.getFlowSquare(x, y);
            if (sq) squares.push(sq);
        }
        return squares;
    }

    override destroy(): void {
        this.destroyFlowOverlays();
        super.destroy();
    }
}
